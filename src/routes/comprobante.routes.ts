import { Router } from 'express';
import { getComprobantes, getComprobantePdf } from '../controllers/comprobante.controller';
import { verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.get('/comprobantes', verifyToken, getComprobantes);
router.get('/comprobantes/:ccodinte/pdf', verifyToken, getComprobantePdf);
export default router;
    