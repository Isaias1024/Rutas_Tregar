// Envoltura de respuesta unica del proyecto (§5): server actions y el
// endpoint del worker devuelven esta forma siempre; ninguna accion lanza un
// string.
export type Resultado<T> =
  | { ok: true; data: T }
  | { ok: false; error: { codigo: string; mensaje: string; campo?: string } };
