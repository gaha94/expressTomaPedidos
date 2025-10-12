import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import ventaRoutes from './routes/venta.routes';
import clienteRoutes from './routes/cliente.routes';
import productoRoutes from './routes/producto.routes'
import pagoRoutes from './routes/pago.routes';
import reporteRoutes from './routes/reporte.routes';
import zonaRoutes from './routes/zona.routes';
import comprobanteRoutes from './routes/comprobante.routes';

dotenv.config();

const app = express();
app.set('trust proxy', 1);

const allowedOrigins = [
  'https://app.163-123-180-94.sslip.io', // tu dominio HTTPS
  'http://localhost:3000'                // opcional: para desarrollo local
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api', ventaRoutes);
app.use('/api', productoRoutes);
app.use('/api', pagoRoutes);
app.use('/api', reporteRoutes);
app.use('/api/zonas', zonaRoutes);
app.use('/api', comprobanteRoutes)

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
