import type { EstadoSemaforo } from '@rutas/shared/tokens';
import { semaforo } from '@rutas/shared/tokens';

// Server-safe a proposito (sin 'use client'): la usan tanto el monitor
// (dentro de un arbol cliente) como los reportes y la pagina imprimible
// (server component puro que Chromium tiene que pintar sin JS).
//
// Pastilla de color pleno, igual que el resto de badges del panel. El par
// fg/bg viene ya contrastado desde `@rutas/shared/tokens`; aqui no se mezcla
// ni se aclara ninguno de los dos.
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
