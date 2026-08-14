import { TZDate } from '@date-fns/tz';

/** `HH:mm` en zona operativa a partir de un timestamp en ms; `null` si no hay hora. */
export function horaTexto(ms: number): string | null {
  if (!ms) return null;
  const fecha = new TZDate(ms, 'America/Mexico_City');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
}
