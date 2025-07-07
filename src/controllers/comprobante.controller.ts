import { Request, Response } from 'express';
import { db } from '../config/db'

export const getComprobantes = async (req: Request, res: Response) => {
  try {
    const [rows] = await db.query('SELECT listado, ctipdocu, cserdocu, ccoddocu FROM gseriesweb');
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener comprobantes:', error);
    res.status(500).json({ message: 'Error interno al obtener comprobantes' });
  }
};
