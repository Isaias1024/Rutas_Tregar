import type { EstadoSemaforo } from '@rutas/shared/tokens';
import { semaforo } from '@rutas/shared/tokens';

// Server-safe a proposito (sin 'use client'): la usa el monitor y tambien la
// pagina imprimible, un server component que Chromium pinta sin JS.
export function PastillaEstado({ estado }: { estado: EstadoSemaforo }) {
  const { texto, fg, bg } = semaforo[estado];
  return (
    <span
      className="inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{ color: fg, backgroundColor: bg }}
    >
      {texto}
    </span>
  );
}
