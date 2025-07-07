import { Request, Response } from 'express'
import { db } from '../config/db'

export const obtenerZonas = async (_req: Request, res: Response) => {
  try {
    const [rows] = await db.query('SELECT idzona, zona FROM gx_zona ORDER BY zona')
    res.json(rows)
  } catch (error) {
    console.error('Error al obtener zonas:', error)
    res.status(500).json({ message: 'Error al obtener zonas' })
  }
}
