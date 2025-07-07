// src/routes/reporte.routes.ts
import { Router } from 'express';
import { verifyToken } from '../middlewares/auth.middleware';
// import { checkRole } from '../middlewares/role.middleware';
import { obtenerReporteVentas, reporteVentas, reporteVentasPorDia, productosMasVendidos, ventasPorCategoria, promedioVentasPorDia, 
  promedioVentasPorMes, ventasMensuales } from '../controllers/reporte.controller';

const router = Router();

router.get('/reportes/ventas', verifyToken, obtenerReporteVentas);
router.get('/reportes/ventas', verifyToken, reporteVentas);
router.get('/reporte/ventas-por-dia', verifyToken, reporteVentasPorDia);
router.get('/reporte/productos-mas-vendidos', verifyToken, productosMasVendidos);
router.get('/reporte/ventas-por-categoria', verifyToken, ventasPorCategoria);
router.get('/reporte/promedio-diario', verifyToken, promedioVentasPorDia);
router.get('/reporte/promedio-mensual', verifyToken, promedioVentasPorMes);
router.get('/reporte/mensual', verifyToken, ventasMensuales);

export default router;
