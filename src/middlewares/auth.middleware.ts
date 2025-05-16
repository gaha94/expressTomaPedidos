// src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface UserPayload {
  id: number;
  rol: string;
  nombre: string;
}

// Agregar propiedad al tipo Request
declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

const SECRET = process.env.JWT_SECRET || 'secreto';

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, SECRET);

    // Verificamos que sea JwtPayload y no un string
    if (typeof decoded === 'string') {
      return res.status(401).json({ message: 'Token inválido' });
    }

    req.user = decoded as UserPayload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
};
