import { Request, Response } from 'express'
import { db } from '../config/db'

export const registrarPago = async (req: Request, res: Response) => {
  const { id_venta, tipo_comprobante, metodo_pago } = req.body

  try {
    // Obtener el total desde detalle_venta
    const [result]: any = await db.query(
      `SELECT SUM(subtotal) AS total FROM detalle_venta WHERE id_venta = ?`,
      [id_venta]
    )

    const total = result[0]?.total
    if (!total) return res.status(404).json({ message: 'Venta no encontrada o sin detalle' })

    const igv = tipo_comprobante === 'factura' ? +(total * 0.18).toFixed(2) : 0

    // Registrar en pagos
    await db.query(
      `INSERT INTO pagos (id_venta, tipo_comprobante, metodo_pago, total, igv) VALUES (?, ?, ?, ?, ?)`,
      [id_venta, tipo_comprobante, metodo_pago, total, igv]
    )

    // Cambiar estado de venta
    await db.query(`UPDATE ventas SET estado = 'aprobado' WHERE id = ?`, [id_venta])

    return res.status(201).json({ message: 'Pago registrado', total, igv })
  } catch (error) {
    console.error('Error al registrar pago:', error)
    res.status(500).json({ message: 'Error al registrar el pago' })
  }
}

export const obtenerPagos = async (_req: Request, res: Response) => {
  try {
    const [pagos]: any = await db.query(`
      SELECT 
        p.id,
        p.id_venta,
        p.tipo_comprobante,
        p.metodo_pago,
        p.total,
        p.igv,
        p.pagado_en,
        v.numero_venta,
        v.estado,
        c.nombre AS cliente,
        u.nombre AS vendedor
      FROM pagos p
      JOIN ventas v ON p.id_venta = v.id
      JOIN clientes c ON v.id_cliente = c.id
      JOIN users u ON v.id_usuario = u.id
      ORDER BY p.pagado_en DESC
    `)

    res.json(pagos)
  } catch (error) {
    console.error('Error al obtener pagos:', error)
    res.status(500).json({ message: 'Error al obtener pagos' })
  }
}
export const obtenerPagoPorId = async (req: Request, res: Response) => {
  const { id } = req.params

  try {
    const [pagos]: any = await db.query(`
      SELECT 
        p.id,
        p.id_venta,
        p.tipo_comprobante,
        p.metodo_pago,
        p.total,
        p.igv,
        p.pagado_en,
        v.numero_venta,
        v.estado,
        c.nombre AS cliente,
        u.nombre AS vendedor
      FROM pagos p
      JOIN ventas v ON p.id_venta = v.id
      JOIN clientes c ON v.id_cliente = c.id
      JOIN users u ON v.id_usuario = u.id
      WHERE p.id = ?
    `, [id])

    if (pagos.length === 0) return res.status(404).json({ message: 'Pago no encontrado' })

    res.json(pagos[0])
  } catch (error) {
    console.error('Error al obtener pago:', error)
    res.status(500).json({ message: 'Error al obtener el pago' })
  }
}