import { Request, Response } from 'express'
import { db } from '../config/db'

// Obtener todos los clientes
export const getClientes = async (_req: Request, res: Response) => {
  try {
    const [rows] = await db.query('SELECT * FROM clientes')
    res.json(rows)
  } catch (error) {
    console.error('Error al obtener clientes:', error)
    res.status(500).json({ message: 'Error al obtener clientes' })
  }
}

// Crear un nuevo cliente
export const createCliente = async (req: Request, res: Response) => {
  const {
    tipo_documento,
    documento,
    nombre,
    direccion,
    telefono,
    correo,
    latitud,
    longitud,
    nestrella = 0,
    cestrella = ''
  } = req.body

  if (!tipo_documento || !documento || !nombre || !direccion) {
    return res.status(400).json({ message: 'Faltan datos obligatorios' })
  }

  try {
    const [result]: any = await db.query(
      `INSERT INTO clientes 
        (tipo_documento, documento, nombre, direccion, telefono, correo, latitud, longitud, nestrella, cestrella)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tipo_documento, documento, nombre, direccion, telefono, correo, latitud, longitud, nestrella, cestrella]
    )

    res.status(201).json({
      message: 'Cliente registrado correctamente',
      clienteId: result.insertId
    })
  } catch (error) {
    console.error('Error al registrar cliente:', error)
    res.status(500).json({ message: 'Error al registrar cliente' })
  }
}


// Actualizar un cliente
export const updateCliente = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { tipo_documento, documento, nombre, direccion, telefono, correo } = req.body;

  try {
    const [result]: any = await db.query(
      'UPDATE clientes SET tipo_documento = ?, documento = ?, nombre = ?, direccion = ?, telefono = ?, correo = ? WHERE id = ?',
      [tipo_documento, documento, nombre, direccion, telefono, correo, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    res.json({ message: 'Cliente actualizado correctamente' });
  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    res.status(500).json({ message: 'Error al actualizar cliente' });
  }
};

export const getClienteById = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const [rows]: any = await db.query('SELECT * FROM clientes WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error al obtener cliente:', error);
    res.status(500).json({ message: 'Error al obtener cliente' });
  }
};

export const deleteCliente = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const [result]: any = await db.query('DELETE FROM clientes WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar cliente:', error);
    res.status(500).json({ message: 'Error al eliminar cliente' });
  }
};

export const getClientesPorZona = async (req: Request, res: Response) => {
  const { zona_id } = req.query;

  if (!zona_id) {
    return res.status(400).json({ message: 'Debe proporcionar zona_id' });
  }

  try {
    const [rows]: any = await db.query(
      'SELECT ccodclie AS id, cnomclie AS nombre, saldo FROM gclientezona WHERE idzona = ?',
      [zona_id]
    )

    res.json(rows);
  } catch (error) {
    console.error('Error al obtener clientes por zona:', error);
    res.status(500).json({ message: 'Error al obtener clientes por zona' });
  }
}

export const getDeudaCliente = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const [rows]: any = await db.query(
      'SELECT ccodclie AS id, cnomclie AS nombre, saldo FROM gclientezona WHERE ccodclie = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error al obtener deuda del cliente:', error);
    res.status(500).json({ message: 'Error al obtener deuda del cliente' });
  }
}

export const getDetalleDeudaCliente = async (req: Request, res: Response) => {
  const { id } = req.params

  try {
    const [rows]: any = await db.query(
      `SELECT 
        ffecdocu AS fecha,
        cdetdocu AS detalle,
        ntotdocu AS total,
        SUM(ntotdocu) OVER (ORDER BY ccodregi, ffecdocu) AS saldo,
        ctipregi,
        ccodinte
      FROM gx_creditos
      WHERE ccodclie = ?
      ORDER BY ccodregi, ffecdocu`,
      [id]
    )

    res.json(rows)
  } catch (error) {
    console.error('Error al obtener el detalle de deuda:', error)
    res.status(500).json({ message: 'Error al obtener el detalle de deuda' })
  }
}

export const getDetalleComprobante = async (req: Request, res: Response) => {
  const { id } = req.params

  try {
    const [rows]: any = await db.query(
      `SELECT 
        tx_salidad.ncanvent AS cantidad,
        tx_salidad.cuniprod AS unidad,
        gx_producto.ctitprod AS producto,
        tx_salidad.npreunit AS punit,
        tx_salidad.ntotregi AS total
      FROM tx_salidad
      JOIN gx_producto ON tx_salidad.ccodprod = gx_producto.ccodprod
      WHERE tx_salidad.ccodinte = ?
      ORDER BY gx_producto.ctitprod`,
      [id]
    )

    res.json(rows)
  } catch (error) {
    console.error('Error al obtener productos del comprobante:', error)
    res.status(500).json({ message: 'Error al obtener productos del comprobante' })
  }
}
// Controlador para buscar clientes por razón social
export const buscarClientes = async (req: Request, res: Response) => {
  const query = req.query.q as string

  if (!query || query.trim() === '') {
    return res.status(400).json({ error: 'Debe enviar el parámetro q' })
  }

  try {
    const [rows] = await db.execute(
      `SELECT 
         ccodclie, 
         crucclie, 
         cnomclie, 
         cdirclie, 
         nestrella, 
         cestrella, 
         COALESCE(gx_cliente.lat, 'Sin ubicación') AS latitud, 
         COALESCE(gx_cliente.long, 'Sin ubicación') AS longitud
       FROM gx_cliente
       WHERE cnomclie LIKE CONCAT('%', ?, '%')
       LIMIT 10`,
      [query]
    )

    res.json(rows)
  } catch (err) {
    console.error('[ERROR] al buscar clientes:', err)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
}
