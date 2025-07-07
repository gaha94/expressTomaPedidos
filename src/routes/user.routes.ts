import { Router } from 'express';
import { verifyToken } from '../middlewares/auth.middleware';
import { getUsers, createUser } from '../controllers/user.controller';

const router = Router();

router.get('/', verifyToken, (req, res) => {
  res.json({ message: 'Ruta protegida', user: req.user });
});

// Ruta protegida: obtener todos los usuarios

router.get('/users', getUsers);

// Ruta para registrar nuevo usuario
router.post('/users/register', verifyToken, createUser);

export default router;
