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
