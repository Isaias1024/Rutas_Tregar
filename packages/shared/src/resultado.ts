// Envoltura de respuesta unica del proyecto: server actions y el endpoint del
// worker devuelven siempre esta forma; ninguna accion lanza un string.
export type Resultado<T> =
  | { ok: true; data: T }
  | { ok: false; error: { codigo: string; mensaje: string; campo?: string } };
