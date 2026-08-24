import { horaInstanteTexto } from '@rutas/shared';

/** `h:mm a` (12h) a partir de un timestamp en ms, en la zona operativa; `null` si no hay hora. */
export function horaTexto(ms: number): string | null {
  if (!ms) return null;
  return horaInstanteTexto(ms);
}
