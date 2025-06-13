import { Request, Response } from 'express'
import { getAllSucursales } from '../models/sucursal.model'

export const obtenerSucursales = async (req: Request, res: Response) => {
  try {
    const sucursales = await getAllSucursales()
    res.json(sucursales)
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener sucursales' })
  }
}
