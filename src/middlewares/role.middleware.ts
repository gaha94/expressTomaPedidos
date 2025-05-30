import { Request, Response, NextFunction } from 'express'

export const checkRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user; // 👈 usamos 'any' si no tienes declaración de tipo
    if (!user?.rol) {
      return res.status(401).json({ message: 'No autorizado: sin rol' });
    }

    if (!roles.includes(user.rol)) {
      return res.status(403).json({ message: 'Acceso denegado: rol insuficiente' });
    }

    next()
  }
}
