import { Router } from 'express'
import { registrarPago, obtenerPagos, obtenerPagoPorId } from '../controllers/pago.controller'
import { verifyToken } from '../middlewares/auth.middleware'
// import { checkRole } from '../middlewares/role.middleware'

const router = Router()

router.post('/pagos', verifyToken, registrarPago)
router.get('/pagos', verifyToken, obtenerPagos)
router.get('/pagos/:id', verifyToken, obtenerPagoPorId)

export default router
