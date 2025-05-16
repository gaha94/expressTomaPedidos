// src/routes/reporte.routes.ts
import { Router } from 'express';
import { verifyToken } from '../middlewares/auth.middleware';
import { checkRole } from '../middlewares/role.middleware';
import { obtenerReporteVentas, reporteVentas, reporteVentasPorDia, productosMasVendidos, ventasPorCategoria, promedioVentasPorDia, 
  promedioVentasPorMes, ventasMensuales } from '../controllers/reporte.controller';

const router = Router();

router.get('/reportes/ventas', verifyToken, checkRole(['admin']), obtenerReporteVentas);
router.get('/reportes/ventas', verifyToken, checkRole(['admin']), reporteVentas);
router.get('/reporte/ventas-por-dia', verifyToken, checkRole(['admin']), reporteVentasPorDia);
router.get('/reporte/productos-mas-vendidos', verifyToken, checkRole(['admin']), productosMasVendidos);
router.get('/reporte/ventas-por-categoria', verifyToken, checkRole(['admin']), ventasPorCategoria);
router.get('/reporte/promedio-diario', verifyToken, checkRole(['admin']), promedioVentasPorDia);
router.get('/reporte/promedio-mensual', verifyToken, checkRole(['admin']), promedioVentasPorMes);
router.get('/reporte/mensual', verifyToken, checkRole(['admin']), ventasMensuales);

export default router;
