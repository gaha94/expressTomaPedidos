// src/types/Venta.ts
export interface VentaCompleta {
  id: number
  numero_venta: string
  fecha: string
  cliente: {
    nombre: string
    documento: string
    direccion: string
  }
  productos: {
    nombre: string
    cantidad: number
    precio_unitario: number
    subtotal: number
  }[]
  total: number
  igv: number
  tipo_comprobante: 'boleta' | 'factura'
}
