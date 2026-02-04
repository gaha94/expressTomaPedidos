import { Request, Response } from 'express';
import { db } from '../config/db';

export const getProductos = async (req: Request, res: Response) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        ccodprod AS id, 
        ctitprod AS nombre, 
        ncpl1000 AS unidad, 
        antiguo AS marca,
        nstock1 AS stock,
        ncpl1011 AS precio1,
        ncpl2011 AS precio2,
        ncpl3011 AS precio3,
        detalle02 AS detalle
      FROM gx_producto
    `);

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
};

export const createProducto = async (req: Request, res: Response) => {
  const { nombre, descripcion, categoria, precio, stock, unidad_medida } = req.body;

  try {
    await db.query(
      'INSERT INTO productos (nombre, descripcion, categoria, precio, stock, unidad_medida) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre, descripcion, categoria, precio, stock, unidad_medida]
    );

    res.status(201).json({ message: 'Producto registrado correctamente' });
  } catch (error) {
  console.error('Error al registrar producto:', error)
  res.status(500).json({ message: 'Error al registrar producto' })
}

};
