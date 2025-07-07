import { Router } from 'express';
import { getComprobantes } from '../controllers/comprobante.controller';
import { verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.get('/comprobantes', verifyToken, getComprobantes);

export default router;
