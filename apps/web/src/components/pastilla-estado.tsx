import type { EstadoSemaforo } from '@rutas/shared/tokens';
import { semaforo } from '@rutas/shared/tokens';

// Server-safe a proposito (sin 'use client'): la usan tanto el monitor
// (dentro de un arbol cliente) como los reportes y la pagina imprimible
// (server component puro que Chromium tiene que pintar sin JS). Icono +
// texto + color siempre juntos (§7): el semaforo nunca depende solo del color.
export function PastillaEstado({ estado }: { estado: EstadoSemaforo }) {
  const { texto, icono, fg, bg } = semaforo[estado];
  return (
    <span
      className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color: fg, backgroundColor: bg }}
    >
      <span aria-hidden="true">{icono}</span>
      {texto}
    </span>
  );
}
