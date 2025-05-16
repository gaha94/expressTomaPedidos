// src/controllers/reporte.controller.ts
import { Request, Response } from 'express';
import { db } from '../config/db';

export const obtenerReporteVentas = async (_req: Request, res: Response) => {
  try {
    const [porDia] = await db.query(`
      SELECT DATE(fecha) AS fecha, COUNT(*) AS cantidad, SUM(p.total) AS total
      FROM ventas v
      JOIN pagos p ON v.id = p.id_venta
      GROUP BY DATE(fecha)
      ORDER BY fecha DESC
      LIMIT 30
    `);

    const [porMes] = await db.query(`
      SELECT DATE_FORMAT(fecha, '%Y-%m') AS mes, COUNT(*) AS cantidad, SUM(p.total) AS total
      FROM ventas v
      JOIN pagos p ON v.id = p.id_venta
      GROUP BY mes
      ORDER BY mes DESC
      LIMIT 12
    `);

    const [porComprobante] = await db.query(`
      SELECT tipo_comprobante, COUNT(*) AS cantidad, SUM(total) AS total
      FROM pagos
      GROUP BY tipo_comprobante
    `);

    const [porEstado] = await db.query(`
      SELECT estado, COUNT(*) AS cantidad
      FROM ventas
      GROUP BY estado
    `);

    res.json({
      porDia,
      porMes,
      porComprobante,
      porEstado
    });
  } catch (error) {
    console.error('Error al obtener reporte:', error);
    res.status(500).json({ message: 'Error al generar reporte' });
  }
};

export const reporteVentas = async (req: Request, res: Response) => {
  const { fecha_inicio, fecha_fin, estado } = req.query;

  let query = 'SELECT * FROM ventas WHERE 1=1';
  const params: any[] = [];

  if (fecha_inicio) {
    query += ' AND fecha >= ?';
    params.push(fecha_inicio);
  }

  if (fecha_fin) {
    query += ' AND fecha <= ?';
    params.push(fecha_fin);
  }

  if (estado) {
    query += ' AND estado = ?';
    params.push(estado);
  }

  try {
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener reporte:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

export const reporteVentasPorDia = async (req: Request, res: Response) => {
  const { mes, anio } = req.query;

  if (!mes || !anio) {
    return res.status(400).json({ message: 'Se requiere mes y año' });
  }

  try {
    const [rows] = await db.query(
      `SELECT 
        DATE(v.fecha) AS dia,
        COUNT(*) AS cantidad_ventas,
        SUM(p.total) AS total_vendido
      FROM ventas v
      JOIN pagos p ON v.id = p.id_venta
      WHERE v.estado = 'aprobado'
        AND MONTH(v.fecha) = ?
        AND YEAR(v.fecha) = ?
      GROUP BY dia
      ORDER BY dia`,
      [mes, anio]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error en reporte:', error);
    res.status(500).json({ message: 'Error al generar reporte' });
  }
};

export const productosMasVendidos = async (_req: Request, res: Response) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        p.nombre AS producto,
        SUM(dv.cantidad) AS total_vendido,
        SUM(dv.subtotal) AS ingreso_total
      FROM detalle_venta dv
      JOIN ventas v ON dv.id_venta = v.id
      JOIN productos p ON dv.id_producto = p.id
      WHERE v.estado = 'aprobado'
      GROUP BY dv.id_producto
      ORDER BY total_vendido DESC
      LIMIT 10`
    );

    res.json(rows);
  } catch (error) {
    console.error('Error en reporte productos más vendidos:', error);
    res.status(500).json({ message: 'Error al generar reporte' });
  }
};

export const ventasPorCategoria = async (_req: Request, res: Response) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        p.categoria,
        SUM(dv.cantidad) AS cantidad_total,
        SUM(dv.subtotal) AS ingreso_total
      FROM detalle_venta dv
      JOIN productos p ON dv.id_producto = p.id
      JOIN ventas v ON dv.id_venta = v.id
      WHERE v.estado = 'aprobado'
      GROUP BY p.categoria
      ORDER BY ingreso_total DESC`
    );

    res.json(rows);
  } catch (error) {
    console.error('Error en reporte por categoría:', error);
    res.status(500).json({ message: 'Error al generar reporte' });
  }
};

export const promedioVentasPorDia = async (req: Request, res: Response) => {
  const { mes, anio } = req.query;

  if (!mes || !anio) {
    return res.status(400).json({ message: 'Se requiere mes y año' });
  }

  try {
    const [rows]: any = await db.query(
      `SELECT 
        COUNT(*) / COUNT(DISTINCT DATE(fecha)) AS promedio_diario,
        SUM(p.total) / COUNT(DISTINCT DATE(fecha)) AS ingreso_promedio_diario
      FROM ventas v
      JOIN pagos p ON v.id = p.id_venta
      WHERE v.estado = 'aprobado'
        AND MONTH(v.fecha) = ?
        AND YEAR(v.fecha) = ?`,
      [mes, anio]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error('Error en promedio diario:', error);
    res.status(500).json({ message: 'Error al generar reporte' });
  }
};

export const promedioVentasPorMes = async (req: Request, res: Response) => {
  const { anio } = req.query;

  if (!anio) {
    return res.status(400).json({ message: 'Se requiere el año' });
  }

  try {
    const [rows]: any = await db.query(
      `SELECT 
        COUNT(*) / COUNT(DISTINCT MONTH(fecha)) AS promedio_mensual,
        SUM(p.total) / COUNT(DISTINCT MONTH(fecha)) AS ingreso_promedio_mensual
      FROM ventas v
      JOIN pagos p ON v.id = p.id_venta
      WHERE v.estado = 'aprobado'
        AND YEAR(v.fecha) = ?`,
      [anio]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error('Error en promedio mensual:', error);
    res.status(500).json({ message: 'Error al generar reporte' });
  }
};

export const ventasMensuales = async (_req: Request, res: Response) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        DATE_FORMAT(v.fecha, '%Y-%m') AS mes,
        COUNT(*) AS total_ventas,
        SUM(p.total) AS total_monto
      FROM ventas v
      JOIN pagos p ON v.id = p.id_venta
      WHERE v.estado = 'aprobado'
      GROUP BY mes
      ORDER BY mes DESC
      LIMIT 6;
    `);

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener reporte mensual:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};