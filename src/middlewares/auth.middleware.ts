// src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

interface UserPayload {
  id: number
  nombre: string
  ccodvend?: number | null // ✅ ahora opcional/nullable
}

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

    const payload = decoded as UserPayload

    // ✅ Validación mínima: id y nombre deben existir
    if (!payload?.id || !payload?.nombre) {
      return res.status(401).json({ message: 'Token inválido' })
    }

    // ✅ Normaliza: si viene 0, undefined o null => null
    const raw = payload.ccodvend
    const ccodvend =
      typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null

    req.user = {
      id: payload.id,
      nombre: payload.nombre,
      ccodvend,
    }

    next()
  } catch (err) {
    return res.status(401).json({ message: 'Token inválido o expirado' })
  }
}
