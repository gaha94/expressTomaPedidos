import jwt from 'jsonwebtoken'

// Interface del payload que contendrá el token
export interface UserPayload {
  id: number
  nombre: string
  rol: 'admin' | 'vendedor' | 'caja'
}

const SECRET = process.env.JWT_SECRET || 'secreto'

// Función para generar token
export const generateToken = (payload: UserPayload): string => {
  return jwt.sign(payload, SECRET, { expiresIn: '1d' })
}

// Función para verificar token
export const verifyToken = (token: string): UserPayload => {
  return jwt.verify(token, SECRET) as UserPayload
}
