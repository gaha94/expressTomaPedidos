export interface UserPayload {
  id: number;
  nombre: string;
  rol: 'admin' | 'vendedor' | 'caja';
}
