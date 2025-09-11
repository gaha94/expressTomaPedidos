import { Request, Response } from 'express'
import PDFDocument from 'pdfkit'
import { db } from '../config/db'
import fs from 'fs'
import path from 'path'

// ==================== EMPRESA ====================
const EMPRESA = {
  nombre: 'DISTRIBUIDORA EL MAESTRITO S.A.C.',
  ruc: 'RUC 20541433890',
  direccion: 'PJ. SANDINO NRO. 188 ANEXO INCHO   JUNIN - HUANCAYO - EL TAMBO',
  logoFileName: 'logo.png',
};

// --- Localiza el logo con varias estrategias ---
function resolveLogoPath(): string | null {
  const candidates = [
    // 1) Producción típica: dist/assets/logo.png  ( __dirname === dist/... )
    path.resolve(__dirname, 'assets', EMPRESA.logoFileName),
    // 2) Si assets quedó fuera de dist (menos común)
    path.resolve(__dirname, '..', 'assets', EMPRESA.logoFileName),
    // 3) Fallback al cwd (por si corres con otra working dir)
    path.resolve(process.cwd(), 'assets', EMPRESA.logoFileName),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

function loadLogoBuffer(): Buffer | null {
  const p = resolveLogoPath();
  if (!p) {
    console.warn('[PDF] Logo NO encontrado en ninguna ruta candidata.');
    return null;
  }
  try {
    console.info('[PDF] Logo encontrado en:', p);
    return fs.readFileSync(p);
  } catch (e) {
    console.warn('[PDF] No se pudo leer el logo en', p, e);
    return null;
  }
}

// ==================== UTIL ====================
type Row = Record<string, any>

const currency = (n: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 })
    .format(Number(n || 0))

/** Devuelve el título del comprobante según el tipo SUNAT (01/03). */
function tituloComprobante(code?: string | null, fallback = 'COMPROBANTE') {
  const c = String(code ?? '').trim();
  if (c === '01') return 'FACTURA ELECTRÓNICA';
  if (c === '03') return 'BOLETA DE VENTA ELECTRÓNICA';
  return fallback;
}

/** Une serie y número en formato "F001-194" si existen; si no, null. */
function formatSerieNumero(serie?: string | null, numero?: string | null): string | null {
  const s = String(serie ?? '').trim();
  const n = String(numero ?? '').trim();
  const joined = [s, n].filter(Boolean).join('-');
  return joined ? joined : null;
}


// ==================== DATA LAYER ====================
async function getCabecera(ccodinte: string) {
  const [rows] = await db.query(
    `
    SELECT
      c.ccodinte,
      c.ctipdocu,
      c.cserdocu,
      c.cnumdocu,
      c.ffecemis        AS fecha_emision,
      c.nvv_docu        AS op_gravada,
      c.nigvdocu        AS igv,
      c.ntotdocu        AS total,
      c.ccodclie,
      c.crucclie        AS ruc,
      c.cnomclie        AS nombre,
      c.cdirclie        AS direccion
    FROM tx_salidac c
    WHERE c.ccodinte = ?
    LIMIT 1
    `,
    [ccodinte]
  ) as unknown as [Row[]]
  return rows?.[0] ?? null
}

async function getDetalles(ccodinte: string) {
  const [rows] = await db.query(
    `
    SELECT
      d.ccodregi,
      d.ccodprod,
      COALESCE(p.ctitprod, d.cdetdocu, d.ccodprod) AS descripcion,
      CAST(d.ncanvent AS DECIMAL(15,3))           AS cantidad,
      CAST(d.npreunit AS DECIMAL(15,6))           AS precio,
      CAST(d.ntotregi AS DECIMAL(15,6))           AS subtotal,
      COALESCE(p.ncpl1000, d.cuniprod)            AS unidad
    FROM tx_salidad d
    LEFT JOIN gx_producto p ON p.ccodprod = d.ccodprod
    WHERE d.ccodinte = ?
    ORDER BY d.ccodregi
    `,
    [ccodinte]
  ) as unknown as [Row[]]
  return rows ?? []
}

async function obtenerComprobante(ccodinte: string) {
  const cab = await getCabecera(ccodinte)
  if (!cab) return null
  const det = await getDetalles(ccodinte)

  let opGravada = Number(cab.op_gravada ?? 0)
  let igv = Number(cab.igv ?? 0)
  let total = Number(cab.total ?? 0)

  if (!total || total === 0) {
    total = det.reduce((acc, r) => acc + Number(r.subtotal ?? 0), 0)
    const igvRate = 0.18
    opGravada = total / (1 + igvRate)
    igv = total - opGravada
  }

  return {
    cabecera: {
      ccodinte: String(cab.ccodinte),
      ctipdocu: String(cab.ctipdocu ?? ''),
      cserdocu: String(cab.cserdocu ?? ''),
      cnumdocu: String(cab.cnumdocu ?? ''),
      ffecemis: cab.fecha_emision,
      op_gravada: opGravada,
      igv,
      total,
      ruc: String(cab.ruc ?? ''),
      nombre: String(cab.nombre ?? ''),
      direccion: String(cab.direccion ?? '')
    },
    detalles: det.map(r => ({
      ccodregi: r.ccodregi,
      ccodprod: r.ccodprod,
      descripcion: r.descripcion ?? '',
      cantidad: Number(r.cantidad ?? 0),
      precio: Number(r.precio ?? 0),
      subtotal: Number(r.subtotal ?? 0),
      unidad: r.unidad ?? ''
    }))
  }
}

// ==================== PDF (MEMORIA) ====================
function generarPdfComprobanteBuffer(data: { cabecera: Row; detalles: Row[] }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 36 })
      const chunks: Buffer[] = []
      doc.on('data', c => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const { cabecera, detalles } = data

      const pageW = doc.page.width
      const M = { left: 36, right: 36, top: 36 }

      // === ENCABEZADO ===
      let cursorY = M.top
      const logoBuf = loadLogoBuffer()
      const logoW = 120, logoH = 60

      if (logoBuf) {
        doc.image(logoBuf, M.left, cursorY, { width: logoW, height: logoH })
      } else {
        // Si no hay logo, deja un espacio similar para no mover el layout
        cursorY += 6
      }

      const empX = M.left
      const empY = cursorY + (logoBuf ? logoH + 6 : 0)

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text(EMPRESA.nombre, empX, empY)
      doc.font('Helvetica').fontSize(10).fillColor('#000')
      doc.text(EMPRESA.ruc, empX, empY + 14)
      doc.text(EMPRESA.direccion, empX, empY + 28)

// Caja de comprobante a la derecha
const compBoxW = 240, compBoxH = 78
const compX = pageW - M.right - compBoxW
const compY = M.top

doc.roundedRect(compX, compY, compBoxW, compBoxH, 6).stroke()

// Nuevo: título según ctipdocu (01/03) y serie-número limpio
const code = String(cabecera.ctipdocu || '').trim()
const titulo = tituloComprobante(code, 'COMPROBANTE')

// Texto inferior: preferimos "F001-194"; si no hay, usamos tu formato anterior "01/F001 000123"
const serieNum = formatSerieNumero(cabecera.cserdocu, cabecera.cnumdocu)
const fallbackCompText = `${cabecera.ctipdocu || ''}/${cabecera.cserdocu || ''} ${cabecera.cnumdocu || ''}`.trim()

doc.font('Helvetica-Bold').fontSize(14)
  .text(titulo, compX, compY + 14, { width: compBoxW, align: 'center' })

doc.font('Helvetica').fontSize(12)
  .text(serieNum ?? (fallbackCompText || '—'), compX, compY + 40, { width: compBoxW, align: 'center' })


      // cursorY por debajo de empresa/caja
      cursorY = Math.max(empY + 70, compY + compBoxH + 16)

      // === DATOS DEL CLIENTE ===
      doc.font('Helvetica-Bold').fontSize(12).text('Datos del Cliente', M.left, cursorY)
      cursorY += 16

      const row = (label: string, value: string) => {
        doc.font('Helvetica-Bold').fontSize(10).text(label, M.left, cursorY, { width: 150 })
        doc.font('Helvetica').fontSize(10).text(value || '—', M.left + 156, cursorY)
        cursorY += 14
      }

      const fecha = new Date(cabecera.ffecemis)
      const fechaTxt = isNaN(fecha.getTime()) ? '-' : fecha.toLocaleDateString('es-PE')

      row('Nombre / Razón Social:', String(cabecera.nombre || '-'))
      row('Documento (RUC/DNI):', String(cabecera.ruc || '-'))
      row('Dirección:', String(cabecera.direccion || '-'))
      row('Fecha Emisión:', fechaTxt)

      cursorY += 8

      // === TABLA DETALLE ===
      const col = { item: 40, desc: 100, und: 360, cant: 410, precio: 460, sub: 520 }
      const headerY = cursorY

      doc.font('Helvetica-Bold').fontSize(9)
      doc.text('Item', col.item, headerY)
      doc.text('Descripción', col.desc, headerY)
      doc.text('Und', col.und, headerY, { width: 40, align: 'center' })
      doc.text('Cant', col.cant, headerY, { width: 40, align: 'right' })
      doc.text('P. Unit', col.precio, headerY, { width: 50, align: 'right' })
      doc.text('Importe', col.sub, headerY, { width: 60, align: 'right' })

      doc.moveTo(M.left, headerY + 14).lineTo(pageW - M.right, headerY + 14).strokeColor('#cccccc').lineWidth(0.5).stroke()

      let y = headerY + 18
      let i = 1

      doc.font('Helvetica').fontSize(9).fillColor('#000')

      for (const d of detalles) {
        const desc = String(d.descripcion ?? '')
        doc.text(String(i).padStart(2, '0'), col.item, y)
        doc.text(desc, col.desc, y, { width: 250 })
        doc.text(String(d.unidad ?? ''), col.und, y, { width: 40, align: 'center' })
        doc.text(Number(d.cantidad ?? 0).toString(), col.cant, y, { width: 40, align: 'right' })
        doc.text(currency(Number(d.precio ?? 0)), col.precio, y, { width: 50, align: 'right' })
        doc.text(currency(Number(d.subtotal ?? 0)), col.sub, y, { width: 60, align: 'right' })

        y += 18
        if (y > 740) {
          doc.addPage()
          const yH = M.top
          doc.font('Helvetica-Bold').fontSize(9)
          doc.text('Item', col.item, yH)
          doc.text('Descripción', col.desc, yH)
          doc.text('Und', col.und, yH, { width: 40, align: 'center' })
          doc.text('Cant', col.cant, yH, { width: 40, align: 'right' })
          doc.text('P. Unit', col.precio, yH, { width: 50, align: 'right' })
          doc.text('Importe', col.sub, yH, { width: 60, align: 'right' })
          doc.moveTo(M.left, yH + 14).lineTo(pageW - M.right, yH + 14).strokeColor('#cccccc').lineWidth(0.5).stroke()
          doc.font('Helvetica').fontSize(9)
          y = yH + 18
        }
        i++
      }

      // === TOTALES ===
      doc.moveDown(1)
      doc.moveTo(pageW - M.right - 240, doc.y).lineTo(pageW - M.right, doc.y).strokeColor('#cccccc').lineWidth(0.5).stroke()
      doc.moveDown(0.5)

      const line = (label: string, value: number) => {
        const yy = doc.y
        doc.font('Helvetica').fontSize(11).fillColor('#000')
        doc.text(label, pageW - M.right - 240, yy, { width: 140, align: 'right' })
        doc.font('Helvetica-Bold')
        doc.text(currency(Number(value || 0)), pageW - M.right - 90, yy, { width: 90, align: 'right' })
        doc.moveDown(0.3)
      }

      line('Op. Gravada:', Number(cabecera.op_gravada ?? 0))
      line('IGV (18%):', Number(cabecera.igv ?? 0))
      line('Total:', Number(cabecera.total ?? 0))

      doc.moveDown(1)
      doc.font('Helvetica').fontSize(9).fillColor('#000').text('Gracias por su compra.', M.left, doc.y)

      doc.end()
    } catch (e) {
      reject(e)
    }
  })
}

// ==================== ENDPOINTS ====================
export const getComprobantes = async (req: Request, res: Response) => {
  try {
    const [rows] = await db.query(
      'SELECT listado, ctipdocu, cserdocu, ccoddocu FROM gseriesweb'
    )
    res.json(rows)
  } catch (error) {
    console.error('Error al obtener comprobantes:', error)
    res.status(500).json({ message: 'Error interno al obtener comprobantes' })
  }
}

export const getComprobantePdf = async (req: Request, res: Response) => {
  const { ccodinte } = req.params
  try {
    const data = await obtenerComprobante(ccodinte)
    if (!data) {
      return res.status(404).json({ error: 'Comprobante no encontrado' })
    }

    const pdfBuffer = await generarPdfComprobanteBuffer(data)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="comprobante-${ccodinte}.pdf"`)
    res.setHeader('Content-Length', pdfBuffer.length)
    return res.end(pdfBuffer)
  } catch (err: any) {
    console.error('Error generando PDF:', err?.message || err, err?.stack)
    return res.status(500).json({ error: 'No se pudo generar el PDF', detail: err?.message })
  }
}
