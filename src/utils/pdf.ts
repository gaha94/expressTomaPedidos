import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode'; // NUEVO
import { VentaCompleta } from '../types/Venta';

/** Opcional: info de empresa y logo */
type EmpresaInfo = {
  nombre: string;
  ruc: string; // puede venir como "RUC 2054..." o solo números
  direccion: string;
  telefono?: string;
  correo?: string;
  /** Ruta relativa/absoluta al logo (PNG/JPG). Se lee a memoria para incrustarlo. */
  logoPath?: string;
};

/** Opcional: info de comprobante si la tienes separada de la venta */
type ComprobanteInfo = {
  /** "01", "03", etc. */
  tipo?: string;
  serie?: string;
  numero?: string;
  hashCpe?: string; // opcional, por si lo traes aquí
};

const soles = (n: number) => `S/ ${Number(n || 0).toFixed(2)}`;

/** Helpers NUEVOS */
const digits = (s?: string) => String(s ?? '').replace(/\D+/g, '');
const isZeros = (s?: string | null) => {
  const t = String(s ?? '').trim();
  return !t || /^0+$/.test(t);
};
const normalizeRuc = (rucLike: string) => digits(rucLike);

/** Resuelve el título del comprobante según el tipo (01, 03, ...) */
function getTituloComprobante(code?: string | null, fallback = 'COMPROBANTE') {
  const c = String(code ?? '').trim();
  if (c === '01') return 'FACTURA ELECTRÓNICA';
  if (c === '03') return 'BOLETA DE VENTA ELECTRÓNICA';
  return fallback;
}

/** Intenta extraer { code, serieNum } de un string tipo "01/F001-194" o "03/B101-889" */
function parseDetalleLike(s?: string | null): { code?: string; serieNum?: string } {
  const t = String(s ?? '').trim();
  const m = t.match(/^(\d{2})\s*[\/-]\s*(.+)$/);
  if (m) return { code: m[1], serieNum: m[2].replace(/\s+/g, ' ').trim() };
  return {};
}

/** Dibuja una fila tipo "Etiqueta: Valor" */
function rowText(
  doc: InstanceType<typeof PDFDocument>,
  label: string,
  value: string,
  x: number,
  y: number,
  labelWidth = 150
) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(label, x, y, { width: labelWidth });
  doc.font('Helvetica').fontSize(10).fillColor('#000').text(value || '—', x + labelWidth + 6, y);
}

/** Pequeña tabla simple (encabezado + filas) */
function drawSimpleTable(opts: {
  doc: InstanceType<typeof PDFDocument>,
  startX: number;
  startY: number;
  rowH?: number;
  widths: number[];
  head: string[];
  rows: string[][];
}) {
  const { doc, startX, startY, widths, head, rows } = opts;
  const rowH = opts.rowH ?? 22;
  const totalW = widths.reduce((a, b) => a + b, 0);

  // Header background
  doc.save();
  doc.rect(startX, startY, totalW, rowH).fill('#eeeeee').restore();

  // Header text
  let x = startX;
  head.forEach((h, i) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000')
      .text(h, x + 4, startY + 6, { width: widths[i] - 8, ellipsis: true });
    x += widths[i];
  });

  // Rows
  let y = startY + rowH;
  rows.forEach(r => {
    let xx = startX;
    r.forEach((cell, i) => {
      doc.font('Helvetica').fontSize(9).fillColor('#000')
        .text(cell ?? '', xx + 4, y + 6, { width: widths[i] - 8, ellipsis: true });
      xx += widths[i];
    });
    // Línea separadora
    doc
      .moveTo(startX, y)
      .lineTo(startX + totalW, y)
      .strokeColor('#cccccc')
      .lineWidth(0.5)
      .stroke();
    y += rowH;
  });

  // Borde externo
  doc
    .rect(startX, startY, totalW, rowH * (rows.length + 1))
    .strokeColor('#cccccc')
    .lineWidth(0.5)
    .stroke();

  return y;
}

/** Construye el texto QR (SUNAT) si hay numeración real */
/** Construye el texto QR EXACTO según especificación:
 * RUC|TIPO|SERIE|NUMERO|MTO_TOTAL_IGV|MTO_TOTAL_COMPROBANTE|FECHA_EMISION|TIPO_DOC_ADQUIRENTE|NUM_DOC_ADQUIRENTE|VALOR_RESUMEN
 *
 * Notas:
 * - TIPO: códigos SUNAT ("01" Factura, "03" Boleta).
 * - FECHA: "YYYY-MM-DD".
 * - MTO_TOTAL_IGV y MTO_TOTAL_COMPROBANTE: con 2 decimales, separador decimal ".", sin separador de miles.
 * - TIPO_DOC_ADQUIRENTE: "6" (RUC, 11 dígitos), "1" (DNI, 8 dígitos), "4" (CE), "7" (Pasaporte). Si no hay, "-".
 * - VALOR_RESUMEN: hash del CPE si lo tienes; si no, "-".
 */
function buildQrTextSunat(params: {
  emisorRuc: string;            // RUC emisor (puede venir con "RUC 2054..." o solo números)
  tipo: '01' | '03' | string;   // "01" | "03"
  serie: string;                // p.ej. "F001"
  numero: string;               // p.ej. "000123"
  igv: number;                  // IGV total del comprobante
  total: number;                // Importe total del comprobante
  fechaISO: string;             // "YYYY-MM-DD"
  receptorTipoDoc?: 'DNI' | 'RUC' | 'CE' | 'PAS';
  receptorNumDoc?: string;
  hashCpe?: string | null;      // VALOR RESUMEN (hash); si no lo tienes, usa "-"
}) {
  const digits = (s?: string) => String(s ?? '').replace(/\D+/g, '');
  const normalizeRuc = (rucLike: string) => digits(rucLike);

  const ruc = normalizeRuc(params.emisorRuc);
  const tipo = String(params.tipo).padStart(2, '0'); // asegura "01"/"03"
  const serie = (params.serie ?? '').toUpperCase().trim();
  const correlativo = String(params.numero ?? '').trim().padStart(8, '0');

  // Números siempre con punto decimal y 2 decimales, sin miles
  const toAmount = (n: number) => Number(n || 0).toFixed(2);

  const mtoTotalIgv = toAmount(params.igv);
  const mtoTotalComprobante = toAmount(params.total);

  // Fecha ya debe venir en "YYYY-MM-DD"; si no, la limpiamos mínimamente
  const fecha = (params.fechaISO || '').slice(0, 10);

  // Tipo Doc Adquirente
  const mapTipoDocAdq = (td?: string) =>
    td === 'RUC' ? '6' :
    td === 'DNI' ? '1' :
    td === 'CE'  ? '4' :
    td === 'PAS' ? '7' : '-';

  const tipoDocAdq = mapTipoDocAdq(params.receptorTipoDoc);
  const numDocAdq = params.receptorNumDoc ? digits(params.receptorNumDoc) : '-';

  const valorResumen = params.hashCpe && params.hashCpe.trim() ? params.hashCpe.trim() : '-';

  // Orden EXACTO solicitado
  return [
    ruc,
    tipo,
    serie,
    correlativo,
    mtoTotalIgv,
    mtoTotalComprobante,
    fecha,
    tipoDocAdq,
    numDocAdq,
    valorResumen,
  ].join('|');
}

/**
 * Genera un PDF de comprobante en memoria (Buffer).
 * - Mantiene la firma original: (venta) => Promise<Buffer>
 * - NO guarda en disco. Todo se construye en memoria.
 */
export const generarPDFBuffer = (venta: VentaCompleta): Promise<Buffer> => {
  // Defaults de empresa y comprobante (sobrescribibles desde venta)
  const EMPRESA_DEFAULT: EmpresaInfo = {
    nombre: 'DISTRIBUIDORA EL MAESTRITO S.A.C.',
    ruc: 'RUC 20541433890',
    direccion: 'PJ. SANDINO NRO. 188 ANEXO INCHO   JUNIN - HUANCAYO - EL TAMBO',
    logoPath: undefined,
  };

  const empresa: EmpresaInfo = {
    ...EMPRESA_DEFAULT,
    ...(venta as any).empresa,
  };

  const comprobante: ComprobanteInfo = {
    ...(venta as any).comprobante,
  };

  // Derivar flags de numeración pendiente
  const numeroRaw = comprobante?.numero;
  const serieRaw = comprobante?.serie;
  const tipoRaw  = comprobante?.tipo;  // "01" | "03" (ideal)

  const isPendiente = isZeros(numeroRaw);
  const hasNumeracion = !isPendiente && !!serieRaw && !!numeroRaw;

  // Título de cabecera
  const headerTitle = isPendiente
    ? 'NOTA DE PEDIDO'
    : getTituloComprobante(tipoRaw, 'COMPROBANTE');

  // String de numeración (solo si emitido)
  const numeracionStr = hasNumeracion ? `${String(serieRaw).trim()}-${String(numeroRaw).trim()}` : '';

  // QR solo cuando haya numeración real
  const shouldDrawQR = hasNumeracion && (tipoRaw === '01' || tipoRaw === '03');

  // Si no tienes subtotal/igv guardados, calcula rápido suponiendo IGV 18%
  const total = Number(venta.total ?? 0);
  const subtotal = (venta as any).subtotal != null ? Number((venta as any).subtotal) : total / 1.18;
  const igv = (venta as any).igv != null ? Number((venta as any).igv) : total - subtotal;

  // Inferir tipo doc cliente si no lo tienes: 11=RUC(6), otro=DNI(1)
  const clienteDoc = String(venta?.cliente?.documento ?? '');
  const clienteTipoDoc: 'DNI' | 'RUC' | 'CE' | 'PAS' | undefined =
    (venta as any)?.clienteTipoDoc
      ? (venta as any).clienteTipoDoc
      : (clienteDoc && digits(clienteDoc).length === 11 ? 'RUC' : 'DNI');

  // Hash si lo tienes
  const hashCpe = (comprobante as any)?.hashCpe ?? (venta as any)?.hashCpe ?? null;

  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const buffers: Buffer[] = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));

    const pageW = doc.page.width;
    const M = { left: 36, right: 36, top: 36 };

    // === Encabezado ===
    let cursorY = M.top;

    // Logo (si existe)
    const maybeDrawLogo = () => {
      try {
        if (!empresa.logoPath) return 0;
        const logoPathAbs = path.isAbsolute(empresa.logoPath)
          ? empresa.logoPath
          : path.join(process.cwd(), empresa.logoPath);
        if (!fs.existsSync(logoPathAbs)) return 0;
        const logoW = 120;
        const logoH = 60;
        doc.image(logoPathAbs, M.left, cursorY, { width: logoW, height: logoH });
        return logoH;
      } catch {
        return 0;
      }
    };

    const logoH = maybeDrawLogo();

    // Datos de empresa (debajo del logo)
    const empX = M.left;
    const empY = cursorY + (logoH ? logoH + 6 : 0);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text(empresa.nombre, empX, empY);
    doc.font('Helvetica').fontSize(10).fillColor('#000');
    doc.text(empresa.ruc, empX, empY + 14);
    doc.text(empresa.direccion, empX, empY + 28);
    if (empresa.telefono) doc.text(`Tel: ${empresa.telefono}`, empX, empY + 42);
    if (empresa.correo)   doc.text(empresa.correo, empX, empY + 56);

    // Caja de cabecera a la derecha (AHORA DINÁMICA)
    const compBoxW = 260;
    const compBoxH = 78;
    const compX = pageW - M.right - compBoxW;
    const compY = M.top;
    doc.roundedRect(compX, compY, compBoxW, compBoxH, 6).stroke();

    // Título: NOTA DE PEDIDO o FACTURA/BOLETA ELECTRÓNICA
    doc.font('Helvetica-Bold').fontSize(14)
      .text(headerTitle, compX, compY + 14, { width: compBoxW, align: 'center' });

    // Numeración solo si emitido
    if (hasNumeracion && numeracionStr) {
      doc.font('Helvetica').fontSize(12)
        .text(numeracionStr, compX, compY + 40, { width: compBoxW, align: 'center' });
    }

    // (Si quisieras mostrar el "tipo" crudo cuando está pendiente, NO lo hacemos para cumplir tu regla)
    // else: no mostrar nada de numeración ni tipo

    cursorY = Math.max(empY + 70, compY + compBoxH + 16);

    // === Datos del cliente ===
    doc.font('Helvetica-Bold').fontSize(12).text('Datos del Cliente', M.left, cursorY);
    cursorY += 16;
    rowText(doc, 'Nombre / Razón Social:', venta.cliente?.nombre || '—', M.left, cursorY);
    cursorY += 14;
    rowText(doc, 'Documento (RUC/DNI):', clienteDoc || '—', M.left, cursorY);
    cursorY += 14;
    rowText(doc, 'Dirección:', venta.cliente?.direccion || '—', M.left, cursorY);
    cursorY += 22;

    // === Detalle de productos (tabla) ===
    const widths = [90, 260, 50, 60, 80, 80]; // Código, Descripción, Und, Cant, P.Unit, Importe
    const head = ['Código', 'Descripción', 'Und', 'Cant', 'P. Unit', 'Importe'];

    const rows = (venta.productos || []).map((it: any) => [
      it.codigo ? String(it.codigo) : '',
      it.nombre ?? '',
      it.unidad ?? '',
      String(it.cantidad ?? 0),
      soles(Number(it.precio_unitario ?? 0)),
      soles(Number(it.subtotal ?? (Number(it.precio_unitario ?? 0) * Number(it.cantidad ?? 0)))),
    ]);

    const afterTableY = drawSimpleTable({
      doc,
      startX: M.left,
      startY: cursorY,
      widths,
      head,
      rows,
      rowH: 22,
    }) + 10;

    // === Totales (caja a la derecha) ===
    const boxW = 230;
    const boxH = 78;
    const boxX = pageW - M.right - boxW;
    const boxY = afterTableY;

    doc.roundedRect(boxX, boxY, boxW, boxH, 6).stroke();
    doc.font('Helvetica').fontSize(11).fillColor('#000');
    doc.text('Op. Grabada:', boxX + 10, boxY + 16);
    doc.text(soles(subtotal), boxX + boxW - 10, boxY + 16, { align: 'right' });

    doc.text('I.G.V. (18%):', boxX + 10, boxY + 36);
    doc.text(soles(igv), boxX + boxW - 10, boxY + 36, { align: 'right' });

    doc.font('Helvetica-Bold');
    doc.text('Total:', boxX + 10, boxY + 56);
    doc.text(soles(total), boxX + boxW - 10, boxY + 56, { align: 'right' });

    // === QR o sello de pendiente ===
    // Posicionamos el QR en el pie izquierdo
    const qrSize = 110;
    const yQR = doc.page.height - doc.page.margins.bottom - qrSize - 10;
    const xQR = doc.page.margins.left;

    if (shouldDrawQR) {
      // Construir texto QR
      const qrText = buildQrTextSunat({
        emisorRuc: empresa.ruc,
        tipo: String(tipoRaw),
        serie: String(serieRaw),
        numero: String(numeroRaw),
        igv,
        total,
        fechaISO: String((venta as any)?.fecha ?? '').slice(0, 10) || '', // "YYYY-MM-DD"
        receptorTipoDoc: clienteTipoDoc,
        receptorNumDoc: clienteDoc,
        hashCpe,
      });

      // Generar QR base64 y dibujar
      // NOTA: toDataURL es async, pero PDFKit escribe secuencialmente; usamos await-like con then antes de doc.end()
      // Para mantener la firma sync aquí dentro, generamos el QR de forma bloqueante (pero en realidad QRCode.toDataURL devuelve Promise)
      // Como ya estamos en una Promise externa, encadenamos .then y continuamos.
      QRCode.toDataURL(qrText, { margin: 0 })
        .then((qrDataUrl) => {
          try {
            doc.image(qrDataUrl, xQR, yQR, { fit: [qrSize, qrSize] });
          } catch {
            doc.fontSize(8).text('QR no disponible', xQR, yQR + 10);
          }
          // Pie / Mensaje final
          doc.font('Helvetica').fontSize(9).fillColor('#000')
            .text('Gracias por su compra.', M.left, boxY + boxH + 20);
          doc.end();
        })
        .catch(() => {
          doc.fontSize(8).text('QR no disponible', xQR, yQR + 10);
          doc.font('Helvetica').fontSize(9).fillColor('#000')
          doc.end();
        });

      return; // importante: salimos para esperar el QR y cerrar dentro del then/catch
    } else {
      // Pendiente: sello/nota
      doc.fontSize(9).fillColor('#666')
        .text('Documento sin numeración. Pendiente de aceptación en sistema de escritorio.', M.left, yQR + 20, {
          width: 280
        });
      doc.fillColor('#000');
    }

    // Pie
    doc.font('Helvetica').fontSize(9).fillColor('#000').text('Gracias por su compra.', M.left, boxY + boxH + 20);

    // Cerrar stream => dispara 'end' y resolvemos el Buffer
    doc.end();
  });
};
