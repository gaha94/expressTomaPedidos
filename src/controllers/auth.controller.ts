import { Request, Response } from 'express'
import { db } from '../config/db'
import { RowDataPacket } from 'mysql2'

interface User extends RowDataPacket {
  ccodusua: number
  ctitusua: string
  cusuusua: string
  cpasusua: string
  ccodvend: number | null
}

export const login = async (req: Request, res: Response): Promise<Response> => {
  const { usuarioPlano, password } = req.body as { usuarioPlano: string; password: string }

  try {
    const crypto = await import('crypto')

    const usuarioHash = crypto.createHash('md5').update(usuarioPlano).digest('hex')
    const passwordHash = crypto.createHash('md5').update(password).digest('hex')

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

    // ✅ Normaliza ccodvend: si no existe / 0 => null
    const ccodvend =
      typeof user.ccodvend === 'number' && Number.isFinite(user.ccodvend) && user.ccodvend > 0
        ? user.ccodvend
        : null

    const { generateToken } = require('../utils/jwt')

    const token = generateToken({
      id: user.ccodusua,
      nombre: user.ctitusua,
      ccodvend, // ✅ puede ser number o null
    })

    return res.json({
      token,
      user: {
        id: user.ccodusua,
        nombre: user.ctitusua,
        ccodvend,
      },
    })
  } catch (error) {
    console.error('Error en login:', error)
    return res.status(500).json({ message: 'Error en el servidor' })
  }
}
