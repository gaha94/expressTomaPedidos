import { Router } from 'express';
import { getClientes, createCliente } from '../controllers/cliente.controller';
import { verifyToken } from '../middlewares/auth.middleware';
import { checkRole } from '../middlewares/role.middleware';

const router = Router();

router.get('/clientes', verifyToken, getClientes);
router.post('/clientes', verifyToken, checkRole(['admin', 'vendedor']), createCliente);

export default router;
