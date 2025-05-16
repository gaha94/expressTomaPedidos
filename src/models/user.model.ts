export interface User {
  id: number;
  nombre: string;
  correo: string;
  password: string;
  rol: 'admin' | 'vendedor' | 'caja';
  activo: boolean;
}
