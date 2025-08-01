// src/controllers/ventas.controller.ts
import { Request, Response } from 'express';
import { db } from '../config/db';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { generarPDFBuffer } from '../utils/pdf';
import { transporter } from '../utils/mailer';
import * as VentaModel from '../models/venta.model'  // ✅ Correcto
import { VentaCompleta } from '../types/Venta';
import crypto from 'crypto';

export const obtenerVentas = async (req: Request, res: Response) => {
  const { estado } = req.query;

  try {
    let query = `
      SELECT 
        v.id, v.numero_venta, v.fecha, v.estado, 
        c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
        SUM(d.subtotal) AS total
      FROM ventas v
      JOIN clientes c ON v.id_cliente = c.id
      JOIN detalle_venta d ON v.id = d.id_venta
    `;

    const params: any[] = [];

    if (estado) {
      query += ' WHERE v.estado = ?';
      params.push(estado);
    }

    query += ' GROUP BY v.id ORDER BY v.fecha DESC';

    const [rows] = await db.query<RowDataPacket[]>(query, params);

    res.json(rows);
  } catch (error) {
    console.error('Error al obt ener ventas:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

// Dentro de src/controllers/venta.controller.ts
export const obtenerVentasPendientes = async (_req: Request, res: Response) => {
  try {
    const [rows]: any = await db.query(
      `SELECT v.id, v.numero_venta, c.nombre AS cliente, c.telefono, SUM(d.subtotal) AS monto
       FROM ventas v
       JOIN clientes c ON v.id_cliente = c.id
       JOIN detalle_venta d ON v.id = d.id_venta
       WHERE v.estado = 'pendiente'
       GROUP BY v.id, v.numero_venta, c.nombre, c.telefono
       ORDER BY v.fecha DESC`
    )

    res.json(rows)
  } catch (error) {
    console.error('Error al obtener ventas pendientes:', error)
    res.status(500).json({ message: 'Error del servidor' })
  }
}

export const obtenerVentaPorId = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM ventas WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Venta no encontrada' });
    res.json(rows[0]);
  } catch (error) {
    console.error('Error al obtener venta:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

export const crearVenta = async (req: Request, res: Response) => {
  const { clienteId, serie, detalle } = req.body;

  // Validación inicial
  if (
    !clienteId ||
    !serie ||
    !serie.ctipdocu ||
    !serie.cserdocu ||
    !Array.isArray(detalle) ||
    detalle.length === 0 ||
    detalle.some((item: any) => !item.productoId || !item.tipoPrecio || !item.ncanprod)
  ) {
    return res.status(400).json({ message: 'Datos incompletos o incorrectos' });
  }

  // Formatea productoId a 10 dígitos (string)
  const detalleAjustado = detalle.map((item: any) => ({
    ...item,
    productoId: item.productoId.toString().padStart(10, "0"),
  }));

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // 🔑 Generar llave única
    const crypto = await import('crypto');
    const ccodinte = crypto.randomBytes(5).toString('hex'); // 10 caracteres
    const ffecemis = new Date();

    // 📄 Obtener serie desde gseriesweb
    const [serieRows]: any = await connection.query(
      'SELECT ccoddocu, ctipdocu, cserdocu FROM gseriesweb WHERE ctipdocu = ? AND cserdocu = ?',
      [serie.ctipdocu, serie.cserdocu]
    );
    if (serieRows.length === 0) throw new Error('Serie no encontrada');
    const { ccoddocu, ctipdocu, cserdocu } = serieRows[0];

    // 👤 Obtener cliente
    const [clienteRows]: any = await connection.query(
      'SELECT ccodclie, crucclie, cnomclie, cdirclie FROM gx_cliente WHERE ccodclie = ?',
      [clienteId]
    );
    if (clienteRows.length === 0) throw new Error('Cliente no encontrado');
    const { ccodclie, crucclie, cnomclie, cdirclie } = clienteRows[0];

    // 📦 Obtener todos los productos del pedido
    const productoIds = detalleAjustado.map((item: any) => item.productoId);
    let productos: any[] = [];
    if (productoIds.length === 1) {
      const [rows]: any = await connection.query(
        `SELECT ccodprod, ncpl1011, ncpl2011, ncpl3011, ctitprod
         FROM gx_producto WHERE ccodprod = ?`,
        [productoIds[0]]
      );
      productos = rows;
    } else {
      const [rows]: any = await connection.query(
        `SELECT ccodprod, ncpl1011, ncpl2011, ncpl3011, ctitprod
         FROM gx_producto WHERE ccodprod IN (${productoIds.map(() => '?').join(',')})`,
        productoIds
      );
      productos = rows;
    }
    if (productos.length !== productoIds.length) {
      throw new Error('Uno o más productos no fueron encontrados');
    }

    let ntotdocu = 0;
    const detalleProcesado = [];

    function pad10(val: any) {
      return val.toString().padStart(10, "0");
    }

    for (const item of detalleAjustado) {
      const prod = productos.find((p: any) => pad10(p.ccodprod) === item.productoId);
      if (!prod) {
        throw new Error(`Producto con código ${item.productoId} no encontrado`);
      }
      const precioUnit =
        item.tipoPrecio === "1" ? parseFloat(prod.ncpl1011) :
        item.tipoPrecio === "2" ? parseFloat(prod.ncpl2011) :
        item.tipoPrecio === "3" ? parseFloat(prod.ncpl3011) : 0;

      const subtotal = +(precioUnit * item.ncanprod).toFixed(2);
      ntotdocu += subtotal;

      detalleProcesado.push({
        ccodprod: prod.ccodprod,
        ctitpro: prod.ctitprod,
        precioUnit,
        cantidad: item.ncanprod,
        subtotal
      });
    }

    const nvv_docu = +(ntotdocu / 1.18).toFixed(2);
    const nigvdocu = +(ntotdocu - nvv_docu).toFixed(2);

    // 📌 Insertar cabecera en `tx_salidac`
    await connection.query(
      `INSERT INTO tx_salidac (
        nroticket, impreso, ffecvenc, ccodinte, ffectras, ffecemis,
        ccoddocu, ctipdocu, cserdocu, cnumdocu,
        ccodclie, crucclie, cnomclie, cdirclie,
        ccodvend, ccodalba, nforpago, ctipmone, ntipcamb,
        nvaligv_, nvv_docu, nigvdocu, ntotdocu,
        ccodalma, canudocu, tipoventa, estado, is_web
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        '', 'N', '0001-01-01', ccodinte, '0001-01-01', ffecemis,
        ccoddocu, ctipdocu, cserdocu, 0,
        ccodclie, crucclie, cnomclie, cdirclie,
        100, 1, 2, 'MN', 1,
        18, nvv_docu, nigvdocu, ntotdocu,
        1, 'N', 'H', 'Z', 1
      ]
    );

    // 📌 Insertar detalles en `tx_salidad`
    for (const item of detalleProcesado) {
      await connection.query(
        `INSERT INTO tx_salidad (
          ncanvent, ctipregi, ccodinte, ccodalma, ccodprod,
          ncanprod, cuniprod, npreunit, ntotregi, cdetdocu, ffecregi
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.cantidad, 'P', ccodinte, 1, item.ccodprod,
          1, 'UNIDAD', item.precioUnit, item.subtotal,
          item.ctitpro, ffecemis
        ]
      );
    }

    await connection.commit();
    res.status(201).json({ message: 'Venta registrada correctamente', codigo: ccodinte });

  } catch (error: any) {
    await connection.rollback();
    console.error('Error al registrar venta:', error.message);
    res.status(500).json({ message: error.message || 'Error al registrar venta' });

  } finally {
    connection.release();
  }
};


export const actualizarEstadoVenta = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { estado } = req.body;

  if (!['aprobado', 'cancelado'].includes(estado)) {
    return res.status(400).json({ message: 'Estado inválido' });
  }

  try {
    // Obtener estado actual de la venta
    const [ventaActual]: any = await db.query('SELECT estado FROM ventas WHERE id = ?', [id]);
    if (!ventaActual.length) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    const estadoAnterior = ventaActual[0].estado;

    // Obtener productos de la venta
    const [detalles]: any = await db.query(
      'SELECT id_producto, cantidad FROM detalle_venta WHERE id_venta = ?',
      [id]
    );

    // 👉 Si se aprueba por primera vez, verificar stock
    if (estado === 'aprobado' && estadoAnterior !== 'aprobado') {
      for (const item of detalles) {
        const [producto]: any = await db.query(
          'SELECT stock, nombre FROM productos WHERE id = ?',
          [item.id_producto]
        );

        if (!producto.length) {
          return res.status(404).json({ message: `Producto ID ${item.id_producto} no encontrado` });
        }

        if (producto[0].stock < item.cantidad) {
          return res.status(400).json({
            message: `Stock insuficiente para el producto "${producto[0].nombre}". Stock actual: ${producto[0].stock}, requerido: ${item.cantidad}`,
          });
        }
      }

      // Restar stock
      for (const item of detalles) {
        await db.query(
          'UPDATE productos SET stock = stock - ? WHERE id = ?',
          [item.cantidad, item.id_producto]
        );
      }
    }

    // 👉 Si se cancela una venta previamente aprobada, devolver stock
    if (estado === 'cancelado' && estadoAnterior === 'aprobado') {
      for (const item of detalles) {
        await db.query(
          'UPDATE productos SET stock = stock + ? WHERE id = ?',
          [item.cantidad, item.id_producto]
        );
      }
    }

    // Actualizar estado de la venta
    await db.query('UPDATE ventas SET estado = ? WHERE id = ?', [estado, id]);

    res.json({ message: `Venta ${estado} correctamente` });
  } catch (error) {
    console.error('Error al actualizar estado de venta:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

export const enviarComprobantePorCorreo = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [rows]: any = await db.query(
      `SELECT v.id, v.numero_venta, v.fecha, v.estado, p.tipo_comprobante, p.igv,
              c.nombre, c.documento, c.direccion, c.correo,
              d.cantidad, d.precio_unitario, d.subtotal,
              pr.nombre AS nombre_producto
       FROM ventas v
       JOIN pagos p ON p.id_venta = v.id
       JOIN clientes c ON v.id_cliente = c.id
       JOIN detalle_venta d ON v.id = d.id_venta
       JOIN productos pr ON d.id_producto = pr.id
       WHERE v.id = ?`,
      [id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    const venta: VentaCompleta = {
      id: rows[0].id,
      numero_venta: rows[0].numero_venta,
      fecha: rows[0].fecha,
      tipo_comprobante: rows[0].tipo_comprobante,
      igv: rows[0].igv,
      cliente: {
        nombre: rows[0].nombre,
        documento: rows[0].documento,
        direccion: rows[0].direccion
      },
      productos: rows.map((r: any) => ({
        nombre: r.nombre_producto,
        cantidad: r.cantidad,
        precio_unitario: r.precio_unitario,
        subtotal: r.subtotal
      })),
      total: rows.reduce((acc: number, r: any) => acc + r.subtotal, 0)
    };

    const pdfBuffer = await generarPDFBuffer(venta);

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: rows[0].correo || req.body.correo,
      subject: `Comprobante de Venta N° ${venta.numero_venta}`,
      text: 'Adjunto se encuentra su comprobante de venta.',
      attachments: [
        {
          filename: `comprobante-${venta.numero_venta}.pdf`,
          content: pdfBuffer
        }
      ]
    });

    res.json({ message: 'Comprobante enviado correctamente' });
  } catch (error) {
    console.error('Error al enviar comprobante:', error);
    res.status(500).json({ message: 'Error al enviar el comprobante' });
  }
};

export const cancelarVenta = async (req: Request, res: Response) => {
  const { id } = req.params

  try {
    const [result] = await db.query('UPDATE ventas SET estado = ? WHERE id = ?', ['cancelado', id])

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ message: 'Venta no encontrada' })
    }

    res.json({ message: 'Venta cancelada correctamente' })
  } catch (error) {
    console.error('Error al cancelar venta:', error)
    res.status(500).json({ message: 'Error al cancelar venta' })
  }
}

export const obtenerVentasDelVendedorHoy = async (req: Request, res: Response) => {
  const vendedorId = req.user?.id;

  if (!vendedorId) return res.status(401).json({ message: 'Vendedor no identificado' });

  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT 
         v.id, v.numero_venta, v.fecha, v.estado, 
         c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
         SUM(d.subtotal) AS total
       FROM ventas v
       JOIN clientes c ON v.id_cliente = c.id
       JOIN detalle_venta d ON v.id = d.id_venta
       WHERE v.id_usuario = ? AND DATE(v.fecha) = CURDATE()
       GROUP BY v.id
       ORDER BY v.fecha DESC`,
      [vendedorId]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener ventas del vendedor:', error);
    res.status(500).json({ message: 'Error al obtener ventas del vendedor' });
  }
};

export const obtenerVentasPorSucursalYFecha = async (req: Request, res: Response) => {
  // Fuerza el tipo correcto
  const sucursal_id = parseInt(req.query.sucursal_id as string)
  const desde = req.query.desde as string
  const hasta = req.query.hasta as string

  console.log('✅ Parámetros forzados:')
  console.log('sucursal_id:', sucursal_id)
  console.log('desde:', desde)
  console.log('hasta:', hasta)

  try {
    const [rows]: any = await db.query(
      `SELECT v.id, v.estado, u.nombre as vendedor
       FROM ventas v
       JOIN users u ON u.id = v.id_usuario
       WHERE v.sucursal_id = ? AND DATE(v.fecha) BETWEEN ? AND ?
       ORDER BY v.fecha DESC`,
      [sucursal_id, desde, hasta]
    )

    console.log('📦 Resultado SQL:', rows)

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Venta no encontrada' })
    }

    res.json(rows)
  } catch (error) {
    console.error('❌ Error SQL:', error)
    res.status(500).json({ message: 'Error al obtener ventas por zona' })
  }
}



