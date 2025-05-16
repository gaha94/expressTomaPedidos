// src/controllers/auth.controller.ts
import { Request, Response } from 'express'
import { db } from '../config/db'
import bcrypt from 'bcrypt'
import * as jwt from '../utils/jwt'
import { RowDataPacket } from 'mysql2'

// Definir la interfaz del usuario
interface User extends RowDataPacket {
  id: number
  nombre: string
  correo: string
  password: string
  rol: 'admin' | 'vendedor' | 'caja'
}

export const login = async (req: Request, res: Response): Promise<Response> => {
  const { correo, password } = req.body

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE correo = ?', [correo])
    const users = rows as User[]
    const user = users[0]

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' })
    }

    const match = await bcrypt.compare(password, user.password)
    if (!match) {
      return res.status(401).json({ message: 'Contraseña incorrecta' })
    }

    const token = jwt.generateToken({
      id: user.id,
      rol: user.rol,
      nombre: user.nombre
    })

    return res.json({
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        correo: user.correo,
        rol: user.rol
      }
    })
  } catch (error) {
    console.error('Error en login:', error)
    return res.status(500).json({ message: 'Error en el servidor' })
  }
}
