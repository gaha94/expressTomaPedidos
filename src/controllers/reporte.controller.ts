import { Request, Response } from 'express'
import { db } from '../config/db'
import { RowDataPacket } from 'mysql2/promise'

// ---------- helpers ----------
function isPositiveInt(n: any) {
  const x = Number(n)
  return Number.isFinite(x) && x > 0 && Number.isInteger(x)
}

function resolveEffectiveVendor(req: Request): number {
  const tokenVend = (req as any)?.user?.ccodvend
  if (isPositiveInt(tokenVend)) return Number(tokenVend)

  const qVend = (req.query.ccodvend as string | undefined)?.trim()
  if (isPositiveInt(qVend)) return Number(qVend)

  // usuario sin vendedor debe elegir
  throw { status: 400, message: 'Debe seleccionar un vendedor (ccodvend)' }
}

function validateDateYYYYMMDD(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v)
}

/**
 * Si ffecemis es DATE (lo usual en tu query actual), BETWEEN funciona OK.
 * Si fuera DATETIME, habría que ajustar a rango [from 00:00:00, to 23:59:59] o < to+1.
 */
function dateRangeWhere_DATE() {
  return `c.ffecemis BETWEEN ? AND ?`
}

// ---------- endpoints ----------

/**
 * GET /api/reportes/vendedores
 * - si es vendedor => devuelve solo su ccodvend (front puede ocultar selector)
 * - si es admin (ccodvend null/0) => lista de vendedores que existen en tx_salidac (APP)
 */
export const listarVendedores = async (req: Request, res: Response) => {
  try {
    const tokenVend = (req as any)?.user?.ccodvend
    if (isPositiveInt(tokenVend)) {
      return res.json([{ ccodvend: Number(tokenVend) }])
    }

    const nroticket = String(req.query.nroticket || 'APP').trim()

    const [rows] = await db.query<RowDataPacket[]>(
      `
      SELECT DISTINCT c.ccodvend
      FROM tx_salidac c
      WHERE c.nroticket = ?
        AND c.ccodvend IS NOT NULL
        AND c.ccodvend <> 0
      ORDER BY c.ccodvend
      `,
      [nroticket]
    )

    return res.json(rows)
  } catch (error: any) {
    console.error('listarVendedores error:', error?.message)
    return res.status(500).json({ message: 'Error al listar vendedores' })
  }
}

/**
 * GET /api/reportes/ventas/resumen?period=daily|biweekly|monthly&from=YYYY-MM-DD&to=YYYY-MM-DD&ccodvend=123(opcional)&nroticket=APP(opcional)
 * Devuelve:
 * - totals: { amount, orders }
 * - series: [{ label, amount, orders }]
 */
export const resumenVentas = async (req: Request, res: Response) => {
  try {
    const ccodvend = resolveEffectiveVendor(req)

    const period = String(req.query.period || 'daily').trim()
    const from = String(req.query.from || '').trim()
    const to = String(req.query.to || '').trim()
    const nroticket = String(req.query.nroticket || 'APP').trim()

    if (!validateDateYYYYMMDD(from) || !validateDateYYYYMMDD(to)) {
      return res.status(400).json({ message: 'from y to deben tener formato YYYY-MM-DD' })
    }

    let labelExpr = ''
    let groupExpr = ''

    if (period === 'daily') {
      labelExpr = "DATE(c.ffecemis)"
      groupExpr = "DATE(c.ffecemis)"
    } else if (period === 'monthly') {
      labelExpr = "DATE_FORMAT(c.ffecemis, '%Y-%m')"
      groupExpr = "DATE_FORMAT(c.ffecemis, '%Y-%m')"
    } else if (period === 'biweekly') {
      // Quincena natural: 1–15 y 16–fin
      labelExpr =
        "CONCAT(DATE_FORMAT(c.ffecemis, '%Y-%m'), '-Q', IF(DAY(c.ffecemis) <= 15, '1', '2'))"
      groupExpr = labelExpr
    } else {
      return res.status(400).json({ message: 'period inválido (daily|biweekly|monthly)' })
    }

    const whereDate = dateRangeWhere_DATE()

    const [series] = await db.query<RowDataPacket[]>(
      `
      SELECT
        ${labelExpr} AS label,
        SUM(c.ntotdocu) AS amount,
        COUNT(*) AS orders
      FROM tx_salidac c
      WHERE c.ccodvend = ?
        AND c.nroticket = ?
        AND ${whereDate}
      GROUP BY ${groupExpr}
      ORDER BY MIN(c.ffecemis)
      `,
      [ccodvend, nroticket, from, to]
    )

    const [tot] = await db.query<RowDataPacket[]>(
      `
      SELECT
        SUM(c.ntotdocu) AS amount,
        COUNT(*) AS orders
      FROM tx_salidac c
      WHERE c.ccodvend = ?
        AND c.nroticket = ?
        AND ${whereDate}
      `,
      [ccodvend, nroticket, from, to]
    )

    return res.json({
      ccodvend,
      nroticket,
      period,
      from,
      to,
      totals: {
        amount: Number(tot?.[0]?.amount || 0),
        orders: Number(tot?.[0]?.orders || 0),
      },
      series: series.map((r) => ({
        label: String(r.label),
        amount: Number(r.amount || 0),
        orders: Number(r.orders || 0),
      })),
    })
  } catch (error: any) {
    const status = error?.status || 500
    console.error('resumenVentas error:', error?.message)
    return res.status(status).json({ message: error?.message || 'Error al obtener resumen' })
  }
}

/**
 * (Opcional) GET /api/reportes/ventas/detalle?from=...&to=...&ccodvend=...(opcional)&nroticket=APP
 * Para tabla: lista comprobantes/ventas del rango
 */
export const detalleVentas = async (req: Request, res: Response) => {
  try {
    const ccodvend = resolveEffectiveVendor(req)

    const from = String(req.query.from || '').trim()
    const to = String(req.query.to || '').trim()
    const nroticket = String(req.query.nroticket || 'APP').trim()

    if (!validateDateYYYYMMDD(from) || !validateDateYYYYMMDD(to)) {
      return res.status(400).json({ message: 'from y to deben tener formato YYYY-MM-DD' })
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `
      SELECT
        c.ccodinte                         AS id,
        c.ffecemis                         AS fecha,
        c.ntotdocu                         AS total,
        c.ctipdocu,
        c.cserdocu,
        LPAD(c.cnumdocu, 8, '0')           AS cnumdocu,
        c.cnomclie                         AS cliente_nombre,
        c.crucclie                         AS cliente_ruc,
        c.cdirclie                         AS cliente_direccion,
        c.ccodvend                         AS ccodvend,
        c.nroticket                        AS nroticket
      FROM tx_salidac c
      WHERE c.ccodvend = ?
        AND c.nroticket = ?
        AND ${dateRangeWhere_DATE()}
      ORDER BY c.ffecemis DESC, c.ccodinte DESC
      `,
      [ccodvend, nroticket, from, to]
    )

    return res.json(
      rows.map((r) => ({
        id: String(r.id),
        fecha: r.fecha,
        total: Number(r.total || 0),
        tipoComprobante: `${r.ctipdocu}/${r.cserdocu} ${r.cnumdocu}`,
        cliente: {
          nombres: r.cliente_nombre,
          ruc: r.cliente_ruc,
          direccion: r.cliente_direccion,
        },
        ccodvend: Number(r.ccodvend || 0),
        nroticket: r.nroticket,
      }))
    )
  } catch (error: any) {
    const status = error?.status || 500
    console.error('detalleVentas error:', error?.message)
    return res.status(status).json({ message: error?.message || 'Error al obtener detalle' })
  }
}
