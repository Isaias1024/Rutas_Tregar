'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Rol = 'admin' | 'supervisor' | 'chofer';

// Admin y supervisor ven exactamente el mismo menu: la unica diferencia
// funcional entre ambos roles es 'crear_supervisor' en @/lib/authz/can, que
// no tiene todavia ninguna pantalla asociada.
const ENLACES: ReadonlyArray<{ href: string; etiqueta: string; roles: readonly Rol[] }> = [
  { href: '/monitor', etiqueta: 'Monitor', roles: ['admin', 'supervisor'] },
  { href: '/planeador', etiqueta: 'Planeador', roles: ['admin', 'supervisor'] },
  { href: '/catalogos/clientes', etiqueta: 'Clientes', roles: ['admin', 'supervisor'] },
  { href: '/catalogos/camiones', etiqueta: 'Camiones', roles: ['admin', 'supervisor'] },
  { href: '/catalogos/choferes', etiqueta: 'Choferes', roles: ['admin', 'supervisor'] },
  { href: '/rutas', etiqueta: 'Rutas', roles: ['admin', 'supervisor'] },
  { href: '/paradas', etiqueta: 'Paradas', roles: ['admin', 'supervisor'] },
  { href: '/reportes/cumplimiento', etiqueta: 'Reportes', roles: ['admin', 'supervisor'] },
  { href: '/bitacora', etiqueta: 'Bitacora', roles: ['admin', 'supervisor'] },
  { href: '/cuenta', etiqueta: 'Mi cuenta', roles: ['admin', 'supervisor', 'chofer'] },
];

interface PropsEnlaces {
  rol: Rol;
  onNavigate?: () => void;
}

function EnlacesNav({ rol, onNavigate }: PropsEnlaces) {
  const pathname = usePathname();
  const visibles = ENLACES.filter((enlace) => enlace.roles.includes(rol));

  return (
    <nav aria-label="Navegacion principal" className="flex flex-col gap-1">
      {visibles.map((enlace) => {
        const activo = pathname === enlace.href || pathname.startsWith(`${enlace.href}/`);
        return (
          <Link
            key={enlace.href}
            href={enlace.href}
            onClick={onNavigate}
            aria-current={activo ? 'page' : undefined}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              activo ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
            }`}
          >
            {enlace.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}

interface Props {
  nombre: string;
  rol: Rol;
}

export function NavegacionPanel({ nombre, rol }: Props) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      {/* Escritorio: barra lateral fija */}
      <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4 md:flex">
        <div>
          <p className="text-sm font-semibold text-foreground">{nombre}</p>
          <p className="text-xs text-muted-foreground capitalize">{rol}</p>
        </div>
        <EnlacesNav rol={rol} />
      </aside>

      {/* Movil: encabezado con boton de menu */}
      <div className="flex items-center justify-between border-b border-border p-3 md:hidden">
        <div>
          <p className="text-sm font-semibold text-foreground">{nombre}</p>
          <p className="text-xs text-muted-foreground capitalize">{rol}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(true)}>
          Menu
        </Button>
      </div>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rutas</DialogTitle>
          </DialogHeader>
          <EnlacesNav rol={rol} onNavigate={() => setAbierto(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
