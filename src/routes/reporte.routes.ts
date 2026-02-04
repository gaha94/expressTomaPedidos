import { Router } from 'express'
import { verifyToken } from '../middlewares/auth.middleware'
import { listarVendedores, resumenVentas, detalleVentas } from '../controllers/reporte.controller'

const router = Router()

router.get('/reportes/vendedores', verifyToken, listarVendedores)
router.get('/reportes/ventas/resumen', verifyToken, resumenVentas)
router.get('/reportes/ventas/detalle', verifyToken, detalleVentas) // opcional

export default router
