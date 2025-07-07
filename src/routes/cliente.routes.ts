import { Router } from 'express';
import {
  getClientes,
  getClienteById,
  getClientesPorZona,
  getDeudaCliente,
  getDetalleDeudaCliente,
  getDetalleComprobante,
  buscarClientes,
  createCliente,
  updateCliente,
  deleteCliente
} from '../controllers/cliente.controller';

import { verifyToken } from '../middlewares/auth.middleware';
// import { checkRole } from '../middlewares/role.middleware';

const router = Router();

// Middleware global para todas las rutas
router.use(verifyToken);

// Rutas base (ya estás en /api/clientes)
router.get('/',verifyToken, getClientes);          // GET /api/clientes
router.get('/buscar', verifyToken, buscarClientes); // GET /api/clientes/buscar
router.get('/zona',verifyToken, getClientesPorZona);          // GET /api/clientes
router.get('/deuda/:id',verifyToken, getDeudaCliente);          // GET /api/clientes
router.get('/detalle/:id',verifyToken, getDetalleDeudaCliente);          // GET /api/clientes
router.get('/comprobante/:id',verifyToken, getDetalleComprobante);          // GET /api/clientes
router.get('/:id',verifyToken, getClienteById);    // GET /api/clientes/1
router.post('/',verifyToken, createCliente);       // POST /api/clientes
router.put('/:id',verifyToken, updateCliente);     // PUT /api/clientes/1
router.delete('/:id',verifyToken, deleteCliente);          // DELETE /api/clientes/1

export default router;
