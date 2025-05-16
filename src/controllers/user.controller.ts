import { Request, Response } from 'express';
import { db } from '../config/db';
import bcrypt from 'bcrypt';

export const getUsers = async (_req: Request, res: Response) => {
  try {
    const [users] = await db.query('SELECT id, nombre, correo, rol, activo FROM users');
    res.json(users);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

export const createUser = async (req: Request, res: Response) => {
  const { nombre, correo, password, rol = 'vendedor' } = req.body;

  if (!nombre || !correo || !password) {
    return res.status(400).json({ message: 'Nombre, correo y contraseña son obligatorios' });
  }

  try {
    // Verificar si ya existe un usuario con ese correo
    const [existente]: any = await db.query('SELECT id FROM users WHERE correo = ?', [correo]);
    if (existente.length > 0) {
      return res.status(400).json({ message: 'El correo ya está registrado' });
    }

    const hashed = await bcrypt.hash(password, 10);

    const [result]: any = await db.query(
      'INSERT INTO users (nombre, correo, password, rol) VALUES (?, ?, ?, ?)',
      [nombre, correo, hashed, rol]
    );

    res.status(201).json({ message: 'Usuario creado correctamente', userId: result.insertId });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({ message: 'Error en el servidor' });
  }
};
