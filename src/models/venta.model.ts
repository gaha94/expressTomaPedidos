import { db } from '../config/db'
import { ResultSetHeader, RowDataPacket } from 'mysql2'

// Define el tipo base
export interface Venta {
  id?: number
  vendedor_id: number
  tipo_comprobante: 'boleta' | 'factura'
  estado: 'pendiente' | 'aprobado' | 'cancelado'
  total: number
  fecha?: Date
}

// Crear venta y retornar el ID generado
export const crearVenta = async (venta: Venta): Promise<number> => {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO ventas (vendedor_id, tipo_comprobante, estado, total, fecha)
     VALUES (?, ?, ?, ?, NOW())`,
    [venta.vendedor_id, venta.tipo_comprobante, venta.estado, venta.total]
  )
  return result.insertId
}

// Obtener todas las ventas pendientes
export const obtenerVentasPendientes = async (): Promise<Venta[]> => {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM ventas WHERE estado = 'pendiente'`
  )
  return rows as Venta[]
}

// Obtener ventas del día por vendedor
export const obtenerVentasPorVendedorHoy = async (vendedorId: number): Promise<Venta[]> => {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM ventas WHERE vendedor_id = ? AND DATE(fecha) = CURDATE()`,
    [vendedorId]
  )
  return rows as Venta[]
}

// Cambiar estado de una venta
export const actualizarEstadoVenta = async (id: number, nuevoEstado: Venta['estado']): Promise<void> => {
  await db.query(
    `UPDATE ventas SET estado = ? WHERE id = ?`,
    [nuevoEstado, id]
  )
}
