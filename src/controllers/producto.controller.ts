import { Request, Response } from 'express';
import { db } from '../config/db';

export const getProductos = async (_req: Request, res: Response) => {
  try {
    const [productos] = await db.query('SELECT * FROM productos');
    res.json(productos);
  } catch {
    res.status(500).json({ message: 'Error al obtener productos' });
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
