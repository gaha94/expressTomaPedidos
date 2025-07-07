import { Request, Response } from 'express'
import { db } from '../config/db'
import { RowDataPacket } from 'mysql2'

interface User extends RowDataPacket {
  ccodusua: number
  ctitusua: string
  cusuusua: string
  cpasusua: string
}

export const login = async (req: Request, res: Response): Promise<Response> => {
  const { usuarioPlano, password } = req.body

  try {
    const crypto = await import('crypto')

    const usuarioHash = crypto.createHash('md5').update(usuarioPlano).digest('hex')
    const passwordHash = crypto.createHash('md5').update(password).digest('hex')

    const [rows] = await db.query('SELECT * FROM lx_farma04 WHERE cusuusua = ?', [usuarioHash])
    const users = rows as User[]
    const user = users[0]

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' })
    }

    if (user.cpasusua !== passwordHash) {
      return res.status(401).json({ message: 'Contraseña incorrecta' })
    }

    const token = require('../utils/jwt').generateToken({
      id: user.ccodusua,
      nombre: user.clitusua
    })

    return res.json({
      token,
      user: {
        id: user.ccodusua,
        nombre: user.clitusua
      }
    })
  } catch (error) {
    console.error('Error en login:', error)
    return res.status(500).json({ message: 'Error en el servidor' })
  }
}
