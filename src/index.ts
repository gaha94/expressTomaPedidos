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

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', clienteRoutes);
app.use('/api', ventaRoutes);
app.use('/api', productoRoutes);
app.use('/api', pagoRoutes);
app.use('/api', reporteRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
