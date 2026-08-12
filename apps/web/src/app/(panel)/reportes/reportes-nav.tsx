'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PESTANAS = [
  { href: '/reportes/cumplimiento', etiqueta: 'Cumplimiento' },
  { href: '/reportes/ocupacion', etiqueta: 'Ocupacion' },
  { href: '/reportes/ejecuciones', etiqueta: 'Ejecuciones' },
  { href: '/reportes/cliente', etiqueta: 'Por cliente' },
];

export function ReportesNav() {
  const pathname = usePathname();
  return (
    // Mismo lenguaje que cualquier fila de filtros del panel: el seleccionado
    // se rellena de color de marca y el resto queda como boton de contorno.
    <nav aria-label="Reportes" className="flex flex-wrap gap-2">
      {PESTANAS.map((pestana) => {
        const activo = pathname === pestana.href || pathname.startsWith(`${pestana.href}/`);
        return (
          <Link
            key={pestana.href}
            href={pestana.href}
            aria-current={activo ? 'page' : undefined}
            className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              activo
                ? 'bg-primary text-primary-foreground shadow-tarjeta hover:bg-primary-hover'
                : 'border border-input bg-background text-foreground hover:bg-accent'
            }`}
          >
            {pestana.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
