import { Router } from 'express'
import { obtenerZonas } from '../controllers/zona.controller'
import { verifyToken } from '../middlewares/auth.middleware'

const router = Router()

router.get('/', verifyToken, obtenerZonas)

export default router
