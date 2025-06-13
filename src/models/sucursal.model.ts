import { db } from '../config/db'

export const getAllSucursales = async () => {
  const [rows] = await db.query('SELECT * FROM sucursales')
  return rows
}
