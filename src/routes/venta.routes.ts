// src/routes/venta.routes.ts
import { Router } from 'express';
import { verifyToken } from '../middlewares/auth.middleware';
import { checkRole } from '../middlewares/role.middleware';
import * as VentaController from '../controllers/venta.controller';

const router = Router();

// Vendedor y admin pueden ver ventas
router.get('/ventas', verifyToken, checkRole(['admin', 'vendedor']), VentaController.obtenerVentas);
router.get('/ventas/:id', verifyToken, checkRole(['admin', 'vendedor']), VentaController.obtenerVentaPorId);

// Vendedor y admin pueden crear ventas
router.post('/ventas/registro', verifyToken, checkRole(['admin', 'vendedor']), VentaController.crearVenta);
router.post('/ventas/:id/enviar-comprobante', verifyToken, checkRole(['admin', 'caja']), VentaController.enviarComprobantePorCorreo);


// Caja puede actualizar estado de la venta
router.put('/ventas/:id/estado', verifyToken, checkRole(['admin', 'caja']), VentaController.actualizarEstadoVenta);

export default router;
