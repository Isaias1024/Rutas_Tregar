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
    <nav aria-label="Reportes" className="flex flex-wrap gap-1 border-b border-border pb-2">
      {PESTANAS.map((pestana) => {
        const activo = pathname === pestana.href || pathname.startsWith(`${pestana.href}/`);
        return (
          <Link
            key={pestana.href}
            href={pestana.href}
            aria-current={activo ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              activo ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {pestana.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
