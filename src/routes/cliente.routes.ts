import { Router } from 'express';
import {
  getClientes,
  getClienteById,
  createCliente,
  updateCliente,
  deleteCliente
} from '../controllers/cliente.controller';

import { verifyToken } from '../middlewares/auth.middleware';
import { checkRole } from '../middlewares/role.middleware';

const router = Router();

// Middleware global para todas las rutas
router.use(verifyToken);

// Rutas base (ya estás en /api/clientes)
router.get('/', checkRole(['admin', 'caja']), getClientes);          // GET /api/clientes
router.get('/:id', checkRole(['admin', 'caja']), getClienteById);    // GET /api/clientes/1
router.post('/', checkRole(['admin', 'caja']), createCliente);       // POST /api/clientes
router.put('/:id', checkRole(['admin', 'caja']), updateCliente);     // PUT /api/clientes/1
router.delete('/:id', checkRole(['admin']), deleteCliente);          // DELETE /api/clientes/1

export default router;
