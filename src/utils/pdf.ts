import PDFDocument from 'pdfkit';
import { VentaCompleta } from '../types/Venta';

export const generarPDFBuffer = (venta: VentaCompleta): Promise<Buffer> => {
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const buffers: Buffer[] = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      resolve(pdfBuffer);
    });

    doc.fontSize(20).text('Comprobante de Venta', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text(`Número de venta: ${venta.numero_venta}`);
    doc.text(`Fecha: ${venta.fecha}`);
    doc.text(`Cliente: ${venta.cliente.nombre}`);
    doc.text(`Documento: ${venta.cliente.documento}`);
    doc.text(`Dirección: ${venta.cliente.direccion}`);
    doc.moveDown();

    doc.text('Detalle de productos:');
    venta.productos.forEach((item, index) => {
      doc.text(
        `${index + 1}. ${item.nombre} - S/ ${item.precio_unitario} x ${item.cantidad} = S/ ${item.subtotal}`
      );
    });

    doc.moveDown();
    doc.fontSize(14).text(`Total: S/ ${venta.total}`, { align: 'right' });

    doc.end();
  });
};
