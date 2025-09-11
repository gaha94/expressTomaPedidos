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

// Crear un nuevo cliente en gx_cliente (mapea a los campos que usa buscarClientes)
export const createCliente = async (req: Request, res: Response) => {
  const {
    tipo_documento,      // "RUC" | "DNI"
    documento,           // -> crucclie
    nombre,              // -> cnomclie
    direccion,           // -> cdirclie
    alias1 = '',         // -> alias1 (nuevo)
    telefono,            // opcional (si tienes columna)
    correo,              // opcional (si tienes columna)
    lat,                 // -> lat
    long,                // -> long
    nestrella = 0,
    cestrella = ''
  } = req.body

  if (!documento || !nombre || !direccion) {
    return res.status(400).json({ message: 'Faltan datos obligatorios' })
  }

  // Normaliza documento
  const doc = String(documento).trim()

  // Validación de documento
  if (tipo_documento === 'DNI') {
    if (!/^\d{8}$/.test(doc)) {
      return res.status(400).json({ message: 'DNI inválido. Debe tener 8 dígitos.' })
    }
  } else if (tipo_documento === 'RUC') {
    if (!/^\d{11}$/.test(doc)) {
      return res.status(400).json({ message: 'RUC inválido. Debe tener 11 dígitos.' })
    }
  } else {
    if (doc.length > 20) {
      return res.status(400).json({ message: 'Documento demasiado largo (máx 20 caracteres).' })
    }
  }

  // --- Validación y normalización de coordenadas ---
  const clampCoord = (v: any, min: number, max: number, decimals = 6) => {
    if (v === undefined || v === null || v === '') return null
    const n = Number(v)
    if (Number.isNaN(n)) return null
    if (n < min || n > max) return null
    return Number(n.toFixed(decimals))
  }

  const latN = clampCoord(lat, -90, 90, 6)
  const longN = clampCoord(long, -180, 180, 6)

  try {
    const [result]: any = await db.query(
      `INSERT INTO gx_cliente 
        (crucclie, cnomclie, cdirclie, alias1, nestrella, cestrella, lat, \`long\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [doc, nombre, direccion, alias1, nestrella, cestrella, latN, longN]
    )

    res.status(201).json({
      message: 'Cliente registrado correctamente',
      clienteId: result.insertId ?? null
    })
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'El documento ya existe' })
    }
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
  const { zona_id } = req.query

  if (!zona_id) {
    return res.status(400).json({ message: 'Debe proporcionar zona_id' })
  }

  try {
    const [rows]: any = await db.query(
      `SELECT 
         g.ccodclie AS id,
         g.cnomclie AS nombre,
         IFNULL(c.alias1, '') AS alias1,
         g.saldo
       FROM gclientezona g
       LEFT JOIN gx_cliente c ON c.ccodclie = g.ccodclie
       WHERE g.idzona = ?`,
      [zona_id]
    )

    res.json(rows)
  } catch (error) {
    console.error('Error al obtener clientes por zona:', error)
    res.status(500).json({ message: 'Error al obtener clientes por zona' })
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
         AND canudocu = 'N'
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
  const q = String(req.query.q || '').trim()
  if (!q) return res.status(400).json({ error: 'Debe enviar el parámetro q' })

  try {
    const [rows] = await db.execute(
      `SELECT 
         ccodclie, 
         crucclie, 
         cnomclie, 
         cdirclie, 
         nestrella, 
         cestrella, 
         alias1,                 -- 👈 incluir alias
         lat  AS latitud, 
         \`long\` AS longitud
       FROM gx_cliente
       WHERE cnomclie LIKE CONCAT('%', ?, '%')
          OR (alias1 IS NOT NULL AND alias1 <> '' AND alias1 LIKE CONCAT('%', ?, '%')) -- opcional: buscar por alias
       ORDER BY cnomclie
       LIMIT 10`,
      [q, q]
    )

    res.json(rows)
  } catch (err) {
    console.error('[ERROR] al buscar clientes:', err)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
}

