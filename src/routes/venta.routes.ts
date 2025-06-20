import { Router } from 'express';
import { verifyToken } from '../middlewares/auth.middleware';
import { checkRole } from '../middlewares/role.middleware';
import * as VentaController from '../controllers/venta.controller';

const router = Router();

// ⚠️ Importante: esta ruta va primero para que no entre en conflicto con /ventas/:id
router.get('/ventas/pendientes', verifyToken, checkRole(['admin', 'caja']), VentaController.obtenerVentasPendientes);

// Vendedor y admin pueden ver ventas
router.get('/ventas', verifyToken, checkRole(['admin', 'vendedor']), VentaController.obtenerVentas);
router.get('/ventas/por-zona', verifyToken, checkRole(['admin', 'vendedor']), VentaController.obtenerVentasPorSucursalYFecha);
router.get('/ventas/vendedor/hoy', verifyToken, checkRole(['vendedor']), VentaController.obtenerVentasDelVendedorHoy);
router.get('/ventas/:id', verifyToken, checkRole(['admin', 'vendedor']), VentaController.obtenerVentaPorId);

// Vendedor y admin pueden crear ventas
router.post('/ventas/registro', verifyToken, checkRole(['admin', 'vendedor']), VentaController.crearVenta);

// Caja puede enviar comprobante
router.post('/ventas/:id/enviar-comprobante', verifyToken, checkRole(['admin', 'caja']), VentaController.enviarComprobantePorCorreo);

// Caja puede actualizar estado de la venta
router.put('/ventas/:id/estado', verifyToken, checkRole(['admin', 'caja']), VentaController.actualizarEstadoVenta);

// Caja puede cancelar venta
router.put('/ventas/:id/cancelar', verifyToken, checkRole(['admin', 'caja']), VentaController.cancelarVenta);



export default router;
