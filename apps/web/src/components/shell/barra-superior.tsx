'use client';

import { ChevronDownIcon, LogOutIcon, MenuIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';

type Rol = 'admin' | 'supervisor' | 'chofer';

const ROL: Record<Rol, { etiqueta: string; variante: 'default' | 'warning' | 'secondary' }> = {
  admin: { etiqueta: 'Administrador', variante: 'default' },
  supervisor: { etiqueta: 'Supervisor', variante: 'warning' },
  chofer: { etiqueta: 'Chofer', variante: 'secondary' },
};

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).slice(0, 2);
  return partes.map((parte) => parte[0]?.toUpperCase() ?? '').join('') || '?';
}

interface Props {
  nombre: string;
  credencial: string;
  rol: Rol;
  /** Ya formateada en el servidor sobre America/Mexico_City (§ no negociable 5). */
  fechaLarga: string;
  /** Server action inyectada desde el layout: `components/` no importa de `app/`. */
  accionCerrarSesion: () => Promise<void>;
  onAbrirMenu: () => void;
}

export function BarraSuperior({
  nombre,
  credencial,
  rol,
  fechaLarga,
  accionCerrarSesion,
  onAbrirMenu,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alClicFuera(evento: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener('mousedown', alClicFuera);
    return () => document.removeEventListener('mousedown', alClicFuera);
  }, []);

  const info = ROL[rol];

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onAbrirMenu}
          aria-label="Abrir menu"
          className="-ml-1 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted md:hidden"
        >
          <MenuIcon className="size-5" />
        </button>
        <p className="truncate text-sm text-muted-foreground">{fechaLarga}</p>
      </div>

      <div className="relative" ref={contenedor}>
        <button
          type="button"
          onClick={() => setAbierto((previo) => !previo)}
          aria-expanded={abierto}
          aria-haspopup="menu"
          className={`flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted ${
            abierto ? 'bg-muted' : ''
          }`}
        >
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          >
            {iniciales(nombre)}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block truncate text-sm font-medium text-foreground">{nombre}</span>
            <span className="block truncate text-xs text-muted-foreground">{credencial}</span>
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className={`hidden size-4 text-muted-foreground transition-transform sm:block ${
              abierto ? 'rotate-180' : ''
            }`}
          />
        </button>

        {abierto ? (
          <div className="absolute top-full right-0 z-50 mt-1 w-64 overflow-hidden rounded-md border border-border bg-popover shadow-menu">
            <div className="border-b border-border p-3">
              <p className="truncate text-sm font-medium text-foreground">{nombre}</p>
              <p className="mb-2 truncate text-xs text-muted-foreground">{credencial}</p>
              <Badge variant={info.variante}>{info.etiqueta}</Badge>
            </div>
            <form action={accionCerrarSesion}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/5"
              >
                <LogOutIcon aria-hidden="true" className="size-4" />
                Cerrar sesion
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}
