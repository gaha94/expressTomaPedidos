import { Request, Response } from 'express'
import { db } from '../config/db'

// Obtener todos los clientes
export const getClientes = async (_req: Request, res: Response) => {
  try {
    const [rows] = await db.query('SELECT * FROM clientes')
    res.json(rows)
  } catch (error) {
    console.error('Error al obtener clientes:', error)
    res.status(500).json({ message: 'Error al obtener clientes' })
  }
}

// Crear un nuevo cliente
export const createCliente = async (req: Request, res: Response) => {
  const { tipo_documento, documento, nombre, direccion, telefono, correo } = req.body

  try {
    const [result]: any = await db.query(
      'INSERT INTO clientes (tipo_documento, documento, nombre, direccion, telefono, correo) VALUES (?, ?, ?, ?, ?, ?)',
      [tipo_documento, documento, nombre, direccion, telefono, correo]
    )

    res.status(201).json({
      message: 'Cliente registrado correctamente',
      clienteId: result.insertId
    })
  } catch (error) {
    console.error('Error al registrar cliente:', error)
    res.status(500).json({ message: 'Error al registrar cliente' })
  }
}

// Actualizar un cliente
export const updateCliente = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { tipo_documento, documento, nombre, direccion, telefono, correo } = req.body;

  try {
    const [result]: any = await db.query(
      'UPDATE clientes SET tipo_documento = ?, documento = ?, nombre = ?, direccion = ?, telefono = ?, correo = ? WHERE id = ?',
      [tipo_documento, documento, nombre, direccion, telefono, correo, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    res.json({ message: 'Cliente actualizado correctamente' });
  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    res.status(500).json({ message: 'Error al actualizar cliente' });
  }
};

export const getClienteById = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const [rows]: any = await db.query('SELECT * FROM clientes WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error al obtener cliente:', error);
    res.status(500).json({ message: 'Error al obtener cliente' });
  }
};

export const deleteCliente = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const [result]: any = await db.query('DELETE FROM clientes WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar cliente:', error);
    res.status(500).json({ message: 'Error al eliminar cliente' });
  }
};


