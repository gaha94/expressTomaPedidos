import { Request, Response } from 'express'
import PDFDocument from 'pdfkit'
import { db } from '../config/db'
import fs from 'fs'
import path from 'path'
import * as QRCode from 'qrcode' // ← seguro para TS sin esModuleInterop

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
    path.resolve(__dirname, 'assets', EMPRESA.logoFileName),
    path.resolve(__dirname, '..', 'assets', EMPRESA.logoFileName),
    path.resolve(process.cwd(), 'assets', EMPRESA.logoFileName),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
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

function tituloComprobante(code?: string | null, fallback = 'COMPROBANTE') {
  const c = String(code ?? '').trim();
  if (c === '01') return 'FACTURA ELECTRÓNICA';
  if (c === '03') return 'BOLETA DE VENTA ELECTRÓNICA';
  return fallback;
}

function formatSerieNumero(serie?: string | null, numero?: string | null): string | null {
  const s = String(serie ?? '').trim();
  const n = String(numero ?? '').trim();
  const joined = [s, n].filter(Boolean).join('-');
  return joined ? joined : null;
}

// ==================== EXTRA HELPERS ====================
const digits = (s?: string) => String(s ?? '').replace(/\D+/g, '');
const isZeros = (s?: string | null) => {
  const t = String(s ?? '').trim();
  return !t || /^0+$/.test(t);
};
const normalizeRuc = (rucLike: string) => digits(rucLike);

/** QR SUNAT: RUC|TIPO|SERIE|NUMERO|IGV|TOTAL|FECHA|TIPO_DOC_ADQ|NUM_DOC_ADQ|VALOR_RESUMEN */
function buildQrTextSunat(params: {
  emisorRuc: string;
  tipo: '01' | '03' | string;
  serie: string;
  numero: string;
  igv: number;
  total: number;
  fechaISO: string;
  receptorTipoDoc?: 'DNI' | 'RUC' | 'CE' | 'PAS';
  receptorNumDoc?: string;
  hashCpe?: string | null;
}) {
  const ruc = normalizeRuc(params.emisorRuc);
  const tipo = String(params.tipo).padStart(2, '0');
  const serie = (params.serie ?? '').toUpperCase().trim();
  const correlativo = String(params.numero ?? '').trim().padStart(8, '0');
  const toAmount = (n: number) => Number(n || 0).toFixed(2);
  const mtoTotalIgv = toAmount(params.igv);
  const mtoTotalComprobante = toAmount(params.total);
  const fecha = (params.fechaISO || '').slice(0, 10);

  const mapTipoDocAdq = (td?: string) =>
    td === 'RUC' ? '6' :
    td === 'DNI' ? '1' :
    td === 'CE'  ? '4' :
    td === 'PAS' ? '7' : '-';

  const tipoDocAdq = mapTipoDocAdq(params.receptorTipoDoc);
  const numDocAdq = params.receptorNumDoc ? digits(params.receptorNumDoc) : '-';
  const valorResumen = params.hashCpe && params.hashCpe.trim() ? params.hashCpe.trim() : '-';

  return [
    ruc, tipo, serie, correlativo,
    mtoTotalIgv, mtoTotalComprobante, fecha,
    tipoDocAdq, numDocAdq, valorResumen,
  ].join('|');
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
  const { cabecera, detalles } = data;

  // Flags de numeración
  const code = String(cabecera.ctipdocu || '').trim();     // "01" | "03"
  const serie = String(cabecera.cserdocu || '').trim();
  const numero = String(cabecera.cnumdocu || '').trim();
  const isPendiente = isZeros(numero);
  const hasNumeracion = !isPendiente && !!serie && !!numero;

  const headerTitle = isPendiente
    ? 'NOTA DE PEDIDO'
    : tituloComprobante(code, 'COMPROBANTE');

  const numeracionStr = hasNumeracion ? `${serie}-${numero}` : '';
  const shouldDrawQR = hasNumeracion && (code === '01' || code === '03');

  // Totales
  const opGravada = Number(cabecera.op_gravada ?? 0);
  const igv = Number(cabecera.igv ?? 0);
  const total = Number(cabecera.total ?? 0);

  // Fecha en ISO "YYYY-MM-DD" (para QR)
  const fechaISO = (() => {
    const d = new Date(cabecera.ffecemis);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  })();

  // Doc cliente
  const clienteDoc = String(cabecera.ruc || '');

  return new Promise((resolve, reject) => {
    const proceed = (qrDataUrl: string | null) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 36 })
        const chunks: Buffer[] = []
        doc.on('data', c => chunks.push(c))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', reject)

        const pageW = doc.page.width
        const M = { left: 36, right: 36, top: 36 }
        const contentBottom = doc.page.height - doc.page.margins.bottom;

        // === ENCABEZADO ===
        let cursorY = M.top
        const logoBuf = loadLogoBuffer()
        const logoW = 120, logoH = 60

        if (logoBuf) {
          doc.image(logoBuf, M.left, cursorY, { width: logoW, height: logoH })
        } else {
          cursorY += 6
        }

        const empX = M.left
        const empY = cursorY + (logoBuf ? logoH + 6 : 0)

        doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text(EMPRESA.nombre, empX, empY)
        doc.font('Helvetica').fontSize(10).fillColor('#000')
        doc.text(EMPRESA.ruc, empX, empY + 14)
        doc.text(EMPRESA.direccion, empX, empY + 28)

        // Caja derecha (cabecera)
        const compBoxW = 240, compBoxH = 78
        const compX = pageW - M.right - compBoxW
        const compY = M.top
        doc.roundedRect(compX, compY, compBoxW, compBoxH, 6).stroke()

        // Título dinámico
        doc.font('Helvetica-Bold').fontSize(14)
          .text(headerTitle, compX, compY + 14, { width: compBoxW, align: 'center' })

        // Numeración SOLO si emitido
        if (hasNumeracion && numeracionStr) {
          doc.font('Helvetica').fontSize(12)
            .text(numeracionStr, compX, compY + 40, { width: compBoxW, align: 'center' })
        }

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
        row('Documento (RUC/DNI):', clienteDoc || '-')
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

        const pageBreakThreshold = contentBottom - 120; // deja 120pt libres

        for (const d of detalles) {
          const desc = String(d.descripcion ?? '')
          doc.text(String(i).padStart(2, '0'), col.item, y)
          doc.text(desc, col.desc, y, { width: 250 })
          doc.text(String(d.unidad ?? ''), col.und, y, { width: 40, align: 'center' })
          doc.text(Number(d.cantidad ?? 0).toString(), col.cant, y, { width: 40, align: 'right' })
          doc.text(currency(Number(d.precio ?? 0)), col.precio, y, { width: 50, align: 'right' })
          doc.text(currency(Number(d.subtotal ?? 0)), col.sub, y, { width: 60, align: 'right' })

          y += 18

          if (y > pageBreakThreshold) {
            doc.addPage()
            const yH = doc.page.margins.top
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

        // Guardamos fin de tabla para colocar QR debajo si hace falta
        const yAfterTable = y;

        // === TOTALES (caja fija para anclar QR) ===
        const boxW = 240;
        const boxH = 78;
        const boxX = pageW - M.right - boxW;
        const boxY = Math.min(yAfterTable + 10, contentBottom - boxH - 40); // deja 40pt para QR/leyenda/espacio

        doc.roundedRect(boxX, boxY, boxW, boxH, 6).stroke();

        // Labels a la izquierda…
        doc.font('Helvetica').fontSize(11).fillColor('#000');
        doc.text('Op. Gravada:', boxX + 10, boxY + 16, { width: 120, align: 'left' });
        doc.text('I.G.V. (18%):', boxX + 10, boxY + 36, { width: 120, align: 'left' });
        doc.font('Helvetica-Bold');
        doc.text('Total:', boxX + 10, boxY + 56, { width: 120, align: 'left' });

        // …y valores a la derecha en un bloque fijo de 100pt
        const valX = boxX + boxW - 110; // inicio del bloque de valores
        doc.font('Helvetica').fontSize(11);
        doc.text(currency(opGravada), valX, boxY + 16, { width: 100, align: 'right' });
        doc.text(currency(igv),      valX, boxY + 36, { width: 100, align: 'right' });
        doc.font('Helvetica-Bold');
        doc.text(currency(total),    valX, boxY + 56, { width: 100, align: 'right' });

        // === QR — esquina inferior izquierda, NUNCA sobre la tabla ===
        const qrSize = 110;
        const xQR = doc.page.margins.left;
        const yQR = Math.max(
          yAfterTable + 8,                                // nunca por encima del fin de tabla
          Math.min(contentBottom - qrSize - 12, boxY + boxH - qrSize) // pero respetando el margen inferior
        );

        if (qrDataUrl) {
          try {
            doc.image(qrDataUrl, xQR, yQR, { fit: [qrSize, qrSize] });
          } catch {
            doc.fontSize(8).text('QR no disponible', xQR, yQR + 10);
          }
        } else if (isPendiente) {
          doc.fontSize(9).fillColor('#666')
            .text('Documento sin numeración. Pendiente de aceptación en sistema de escritorio.', xQR, yQR + 20, { width: 280 });
          doc.fillColor('#000');
        }

        // === Pie: debajo de lo que esté más abajo (QR o caja de totales) ===
        const bottomOfQr = yQR + qrSize + 14;
        const bottomOfBox = boxY + boxH + 14;
        const footerY = Math.min(contentBottom - 14, Math.max(bottomOfQr, bottomOfBox) + 6);


        doc.end()
      } catch (e) {
        reject(e)
      }
    };

    if (shouldDrawQR) {
      const qrText = buildQrTextSunat({
        emisorRuc: EMPRESA.ruc,
        tipo: code,
        serie,
        numero,
        igv,
        total,
        fechaISO,
        receptorNumDoc: clienteDoc,
      });
      QRCode.toDataURL(qrText, { margin: 0 })
        .then((url: string) => proceed(url))
        .catch(() => proceed(null));
    } else {
      proceed(null);
    }
  });
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
    if (!data) return res.status(404).json({ error: 'Comprobante no encontrado' })

    const pdfBuffer = await generarPdfComprobanteBuffer(data)

    res.status(200)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="comprobante-${ccodinte}.pdf"`)
    res.setHeader('Content-Length', String(pdfBuffer.length))

    // ✅ IMPORTANTÍSIMO en iPhone Safari (evita respuestas cacheadas/cortadas)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')

    return res.send(pdfBuffer) // ✅ en vez de res.end
  } catch (err: any) {
    console.error('Error generando PDF:', err?.message || err, err?.stack)
    return res.status(500).json({ error: 'No se pudo generar el PDF', detail: err?.message })
  }
}

