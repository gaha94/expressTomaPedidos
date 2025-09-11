// src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

interface UserPayload {
  id: number
  nombre: string
  ccodvend: number        // 👈 añade ccodvend
}

// ✅ Extiende Request para que TS no se queje en req.user.ccodvend
declare global {
  namespace Express {
    interface Request {
      user?: UserPayload
    }
  }
}

const SECRET = process.env.JWT_SECRET || 'secreto'

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  const token = authHeader?.split(' ')[1]

  if (!token) {
    return res.status(401).json({ message: 'Token no proporcionado' })
  }

  try {
    const decoded = jwt.verify(token, SECRET)

    if (typeof decoded === 'string') {
      return res.status(401).json({ message: 'Token inválido' })
    }

    // 👇 decoded debe venir con ccodvend porque lo agregaste en el login
    const payload = decoded as UserPayload

    // Defensa: si el token no trae ccodvend, bloquea (coherente con tu política)
    if (payload.ccodvend === undefined) {
      return res.status(401).json({ message: 'Token inválido: falta ccodvend' })
    }

    req.user = payload
    next()
  } catch (err) {
    return res.status(401).json({ message: 'Token inválido o expirado' })
  }
}
