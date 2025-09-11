import { Request, Response } from 'express'
import { db } from '../config/db'
import { RowDataPacket } from 'mysql2'

interface User extends RowDataPacket {
  ccodusua: number
  ctitusua: string
  cusuusua: string
  cpasusua: string
  ccodvend: number // 100 habilitado, 0 bloqueado
}

export const login = async (req: Request, res: Response): Promise<Response> => {
  const { usuarioPlano, password } = req.body as { usuarioPlano: string; password: string }

  try {
    const crypto = await import('crypto')

    // Se siguen usando los mismos hashes MD5 que ya maneja tu BD
    const usuarioHash = crypto.createHash('md5').update(usuarioPlano).digest('hex')
    const passwordHash = crypto.createHash('md5').update(password).digest('hex')

    // Trae solo las columnas necesarias, incluyendo ccodvend
    const [rows] = await db.query<User[]>(
      `
      SELECT 
        ccodusua, ctitusua, cusuusua, cpasusua, ccodvend
      FROM lx_farma04
      WHERE cusuusua = ?
      LIMIT 1
      `,
      [usuarioHash]
    )

    const user = rows?.[0]

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' })
    }

    if (user.cpasusua !== passwordHash) {
      return res.status(401).json({ message: 'Contraseña incorrecta' })
    }

    // ✅ Nuevo: solo permite login si ccodvend = 100
    if (!user.ccodvend || user.ccodvend === 0) {
      return res.status(403).json({ message: 'El usuario no tiene registrado un código de vendedor' })
    }

    const token = require('../utils/jwt').generateToken({
      id: user.ccodusua,
      nombre: user.ctitusua,
      ccodvend: user.ccodvend
    })

    return res.json({
      token,
      user: {
        id: user.ccodusua,
        nombre: user.ctitusua,
        ccodvend: user.ccodvend
      }
    })
  } catch (error) {
    console.error('Error en login:', error)
    return res.status(500).json({ message: 'Error en el servidor' })
  }
}
