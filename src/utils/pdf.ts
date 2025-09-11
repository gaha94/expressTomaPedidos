import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { VentaCompleta } from '../types/Venta';

/** Opcional: info de empresa y logo */
type EmpresaInfo = {
  nombre: string;
  ruc: string;
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
};

const soles = (n: number) => `S/ ${Number(n || 0).toFixed(2)}`;

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
  // Formatos tolerados: "01/F001-194", "01- F001-194", "01 / F001-194"
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

/**
 * Genera un PDF de comprobante en memoria (Buffer).
 * - Mantiene la firma original: (venta) => Promise<Buffer>
 * - NO guarda en disco. Todo se construye en memoria.
 * - Diseño: logo izq., empresa debajo; caja de comprobante a la derecha;
 *           datos del cliente; tabla de items; caja de totales.
 *
 * Requisitos mínimos esperados en VentaCompleta (adáptalo a tu tipo real):
 * {
 *   numero_venta: string;
 *   fecha: string; // YYYY-MM-DD o similar
 *   cliente: { nombre: string; documento: string; direccion: string };
 *   productos: Array<{
 *     nombre: string;
 *     precio_unitario: number;
 *     cantidad: number;
 *     subtotal: number;
 *     codigo?: string; unidad?: string;
 *   }>;
 *   total: number;
 *   comprobante?: { tipo?: string; serie?: string; numero?: string }; // opcional
 *   empresa?: EmpresaInfo; // opcional (si no está, se usa un default)
 * }
 */
export const generarPDFBuffer = (venta: VentaCompleta): Promise<Buffer> => {
  // Defaults de empresa y comprobante (sobrescribibles desde venta)
  const EMPRESA_DEFAULT: EmpresaInfo = {
    nombre: 'DISTRIBUIDORA EL MAESTRITO S.A.C.',
    ruc: 'RUC 20541433890',
    direccion: 'PJ. SANDINO NRO. 188 ANEXO INCHO   JUNIN - HUANCAYO - EL TAMBO',
    // coloca un logo si quieres (e.g. 'assets/logo.png' relativo al proyecto)
    logoPath: undefined,
  };

  const empresa: EmpresaInfo = {
    ...EMPRESA_DEFAULT,
    ...(venta as any).empresa,
  };

  const comprobante: ComprobanteInfo = {
    ...(venta as any).comprobante,
  };

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

    // Caja de comprobante a la derecha
    const compBoxW = 240;
    const compBoxH = 78;
    const compX = pageW - M.right - compBoxW;
    const compY = M.top;
    doc.roundedRect(compX, compY, compBoxW, compBoxH, 6).stroke();
    doc.font('Helvetica-Bold').fontSize(14).text('COMPROBANTE', compX, compY + 14, { width: compBoxW, align: 'center' });

    let compText = '';
    if (comprobante?.tipo || comprobante?.serie || comprobante?.numero) {
      compText = `${comprobante?.tipo ?? ''}/${comprobante?.serie ?? ''} ${comprobante?.numero ?? ''}`.trim();
    } else if ((venta as any).tipoComprobante) {
      // fallback si venía en otro campo como "01/F004 000123"
      compText = String((venta as any).tipoComprobante);
    } else {
      compText = `Venta N° ${venta.numero_venta ?? ''}`.trim();
    }

    doc.font('Helvetica').fontSize(12).text(compText || '—', compX, compY + 40, { width: compBoxW, align: 'center' });

    cursorY = Math.max(empY + 70, compY + compBoxH + 16);

    // === Datos del cliente ===
    doc.font('Helvetica-Bold').fontSize(12).text('Datos del Cliente', M.left, cursorY);
    cursorY += 16;
    rowText(doc, 'Nombre / Razón Social:', venta.cliente?.nombre || '—', M.left, cursorY);
    cursorY += 14;
    rowText(doc, 'Documento (RUC/DNI):', venta.cliente?.documento || '—', M.left, cursorY);
    cursorY += 14;
    rowText(doc, 'Dirección:', venta.cliente?.direccion || '—', M.left, cursorY);
    cursorY += 22;

    // === Detalle de productos (tabla) ===
    const widths = [90, 260, 50, 60, 80, 80]; // Código, Descripción, Und, Cant, P.Unit, Importe
    const head = ['Código', 'Descripción', 'Und', 'Cant', 'P. Unit', 'Importe'];

    // Mapea tus campos a la tabla (usa fallbacks si no tienes código/unidad)
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
    // Si no tienes subtotal/igv guardados, calcula rápido suponiendo IGV 18%
    const total = Number(venta.total ?? 0);
    const subtotal = (venta as any).subtotal != null ? Number((venta as any).subtotal) : total / 1.18;
    const igv = (venta as any).igv != null ? Number((venta as any).igv) : total - subtotal;

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

    // === Pie ===
    doc.font('Helvetica').fontSize(9).fillColor('#000').text('Gracias por su compra.', M.left, boxY + boxH + 20);

    // Cerrar stream => dispara 'end' y resolvemos el Buffer
    doc.end();
  });
};
