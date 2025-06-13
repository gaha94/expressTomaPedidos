import { Router } from 'express'
import { obtenerSucursales } from '../controllers/sucursal.controller'
import { verifyToken } from '../middlewares/auth.middleware'

const router = Router()

router.get('/', verifyToken, obtenerSucursales)

export default router
