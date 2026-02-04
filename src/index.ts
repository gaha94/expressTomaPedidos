import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

import authRoutes from './routes/auth.routes'
import userRoutes from './routes/user.routes'
import ventaRoutes from './routes/venta.routes'
import clienteRoutes from './routes/cliente.routes'
import productoRoutes from './routes/producto.routes'
import pagoRoutes from './routes/pago.routes'
import reporteRoutes from './routes/reporte.routes'
import zonaRoutes from './routes/zona.routes'
import comprobanteRoutes from './routes/comprobante.routes'

dotenv.config()

const app = express()
app.set('trust proxy', 1)

// ✅ DOMINIOS PERMITIDOS
const allowedOrigins = [
  'https://maestrito.galaxiasoftware.com',       // Frontend Next.js
  'https://api.maestrito.galaxiasoftware.com',   // API (si algún servicio llama internamente)
  'https://cajas.galaxiasoftware.com',           // ✅ nuevo
  'https://api.cajas.galaxiasoftware.com',       // ✅ nuevo
  'http://localhost:3000',                       // Desarrollo local Frontend
  'http://localhost:4001',                       // Desarrollo local Backend
]

// ✅ Un solo set de opciones (para que preflight y requests normales sean consistentes)
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('Not allowed by CORS: ' + origin))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}

app.use(cors(corsOptions))
// ✅ Preflight explícito usando las MISMAS opciones (no cors() “abierto”)
app.options('*', cors(corsOptions))

app.use(express.json())

// RUTAS
app.use('/api', authRoutes)
app.use('/api', userRoutes)

app.use('/api/clientes', clienteRoutes)
app.use('/api/zonas', zonaRoutes)

app.use('/api', ventaRoutes)
app.use('/api', productoRoutes)
app.use('/api', pagoRoutes)

app.use('/api', reporteRoutes)
app.use('/api', comprobanteRoutes)

// ✅ Manejo de errores (CORS devuelve 403 en vez de 500)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = err?.message || 'Error interno'
  const isCors = typeof msg === 'string' && msg.startsWith('Not allowed by CORS:')
  console.error('Middleware error:', msg)
  return res.status(isCors ? 403 : 500).json({ message: msg })
})

// PUERTO DEL SERVIDOR
const PORT = Number(process.env.PORT || 4001)
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Servidor corriendo en http://127.0.0.1:${PORT}`)
})
