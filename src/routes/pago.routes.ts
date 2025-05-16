import { Router } from 'express'
import { registrarPago, obtenerPagos, obtenerPagoPorId } from '../controllers/pago.controller'
import { verifyToken } from '../middlewares/auth.middleware'
import { checkRole } from '../middlewares/role.middleware'

const router = Router()

router.post('/pagos', verifyToken, checkRole(['caja', 'admin']), registrarPago)
router.get('/pagos', verifyToken, checkRole(['admin', 'caja']), obtenerPagos)
router.get('/pagos/:id', verifyToken, checkRole(['admin', 'caja']), obtenerPagoPorId)

export default router
