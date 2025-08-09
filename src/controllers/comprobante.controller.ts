import { Request, Response } from 'express'
import PDFDocument from 'pdfkit'
import { db } from '../config/db'

// ==================== UTIL ====================
type Row = Record<string, any>

const currency = (n: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 })
    .format(Number(n || 0))

// ==================== DATA LAYER ====================
// Cabecera desde tx_salidac (usa campos reales de tu tabla)
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

// Detalle desde tx_salidad + nombre producto desde gx_producto
async function getDetalles(ccodinte: string) {
  const [rows] = await db.query(
    `
    SELECT
      d.ccodregi,                                   -- PK de línea (para ordenar)
      d.ccodprod,
      COALESCE(p.ctitprod, d.cdetdocu, d.ccodprod) AS descripcion,
      d.ncanprod                                    AS cantidad,
      d.npreunit                                    AS precio,
      d.ntotregi                                    AS subtotal,
      COALESCE(p.ncpl1000, d.cuniprod)              AS unidad
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

  // Totales desde cabecera (fallback: sumar detalle si vienen en 0)
  let opGravada = Number(cab.op_gravada ?? 0)
  let igv = Number(cab.igv ?? 0)
  let total = Number(cab.total ?? 0)

  if (!total || total === 0) {
    total = det.reduce((acc, r) => acc + Number(r.subtotal ?? 0), 0)
    // si no tienes desglosado, puedes calcular base/igv
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
      const doc = new PDFDocument({ size: 'A4', margin: 40 })
      const chunks: Buffer[] = []
      doc.on('data', c => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const { cabecera, detalles } = data

      // Encabezado
      doc.fontSize(18).text('COMPROBANTE DE VENTA', { align: 'center' })
      doc.moveDown(0.5)
      doc.fontSize(10)
      // TODO: reemplaza por datos reales de tu empresa
      doc.text('Ferretería Ejemplo S.A.C.')
      doc.text('RUC: 20123456789')
      doc.text('Av. Siempre Viva 123, Lima')
      doc.moveDown(0.8)

      // Cabecera del documento
      const fecha = new Date(cabecera.ffecemis)
      doc.text(`Tipo: ${cabecera.ctipdocu || '-'}`)
      doc.text(`Serie-Número: ${cabecera.cserdocu || ''}-${cabecera.cnumdocu || ''}`)
      doc.text(`Fecha: ${isNaN(fecha.getTime()) ? '-' : fecha.toLocaleDateString('es-PE')}`)
      doc.moveDown(0.4)
      doc.text(`Cliente: ${cabecera.nombre || '-'}`)
      doc.text(`Documento: ${cabecera.ruc || '-'}`)
      doc.text(`Dirección: ${cabecera.direccion || '-'}`)
      doc.moveDown(1)

      // Tabla de detalle
      const colX = { item: 40, desc: 100, cant: 360, precio: 420, sub: 500 }
      const y0 = doc.y
      doc.font('Helvetica-Bold')
      doc.text('Item', colX.item, y0)
      doc.text('Descripción', colX.desc, y0)
      doc.text('Cant.', colX.cant, y0, { width: 50, align: 'right' })
      doc.text('Precio', colX.precio, y0, { width: 60, align: 'right' })
      doc.text('Subtotal', colX.sub, y0, { width: 60, align: 'right' })
      doc.moveDown(0.5)
      doc.font('Helvetica')
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke()

      let y = doc.y + 5
      let i = 1

      for (const d of detalles) {
        doc.text(String(i).padStart(2, '0'), colX.item, y)
        doc.text(String(d.descripcion ?? ''), colX.desc, y, { width: 250 })
        doc.text(Number(d.cantidad ?? 0).toString(), colX.cant, y, { width: 50, align: 'right' })
        doc.text(currency(Number(d.precio ?? 0)), colX.precio, y, { width: 60, align: 'right' })
        doc.text(currency(Number(d.subtotal ?? 0)), colX.sub, y, { width: 60, align: 'right' })

        y += 18
        if (y > 750) {
          doc.addPage()
          y = 60
        }
        i++
      }

      doc.moveDown(1)
      doc.moveTo(350, doc.y).lineTo(555, doc.y).stroke()
      doc.moveDown(0.5)

      // Totales (desde cabecera ya calculados)
      const line = (label: string, value: number) => {
        const yy = doc.y
        doc.font('Helvetica').text(label, 350, yy, { width: 120, align: 'right' })
        doc.font('Helvetica-Bold').text(currency(value), 480, yy, { width: 80, align: 'right' })
        doc.moveDown(0.2)
      }
      line('Op. Gravada:', Number(cabecera.op_gravada ?? 0))
      line('IGV (18%):', Number(cabecera.igv ?? 0))
      line('Total:', Number(cabecera.total ?? 0))

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
