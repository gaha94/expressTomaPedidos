import { Router } from 'express'
import { createProducto, getProductos } from '../controllers/producto.controller'
import { verifyToken } from '../middlewares/auth.middleware'
import { checkRole } from '../middlewares/role.middleware'

const router = Router()

router.post('/productos', verifyToken, checkRole(['admin']), createProducto)
router.get('/productos', verifyToken, checkRole(['admin', 'vendedor', 'caja']), getProductos);


export default router
