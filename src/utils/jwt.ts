import jwt from 'jsonwebtoken'

// 👇 Payload REAL del sistema
export interface UserPayload {
  id: number
  nombre: string
  ccodvend?: number | null   // ✅ ahora soporta vendedor y no-vendedor
}

const SECRET = process.env.JWT_SECRET || 'secreto'

// Generar token
export const generateToken = (payload: UserPayload): string => {
  return jwt.sign(payload, SECRET, {
    expiresIn: '1d',
  })
}

// Verificar token
export const verifyToken = (token: string): UserPayload => {
  const decoded = jwt.verify(token, SECRET)

  if (typeof decoded === 'string') {
    throw new Error('Token inválido')
  }

  return decoded as UserPayload
}
