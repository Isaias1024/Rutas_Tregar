'use client';

import {
  ActivityIcon,
  Building2Icon,
  CalendarDaysIcon,
  ChartColumnIcon,
  MapPinIcon,
  RouteIcon,
  ScrollTextIcon,
  TruckIcon,
  UserCogIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useRef } from 'react';

type Rol = 'admin' | 'supervisor' | 'chofer';

export const ANCHO_SIDEBAR_DEFECTO = 256;
export const ANCHO_SIDEBAR_MIN = 208;
export const ANCHO_SIDEBAR_MAX = 420;

interface Enlace {
  href: string;
  etiqueta: string;
  icono: ComponentType<{ className?: string }>;
  roles: readonly Rol[];
}

// Admin y supervisor ven exactamente el mismo menu: la unica diferencia
// funcional entre ambos roles es 'crear_supervisor' en @/lib/authz/can, que
// no tiene todavia ninguna pantalla asociada.
const GRUPOS: ReadonlyArray<{ titulo: string; enlaces: readonly Enlace[] }> = [
  {
    titulo: 'Operacion',
    enlaces: [
      {
        href: '/monitor',
        etiqueta: 'Monitor',
        icono: ActivityIcon,
        roles: ['admin', 'supervisor'],
      },
      {
        href: '/planeador',
        etiqueta: 'Planeador',
        icono: CalendarDaysIcon,
        roles: ['admin', 'supervisor'],
      },
    ],
  },
  {
    titulo: 'Catalogos',
    enlaces: [
      {
        href: '/catalogos/clientes',
        etiqueta: 'Clientes',
        icono: Building2Icon,
        roles: ['admin', 'supervisor'],
      },
      {
        href: '/catalogos/camiones',
        etiqueta: 'Camiones',
        icono: TruckIcon,
        roles: ['admin', 'supervisor'],
      },
      {
        href: '/catalogos/choferes',
        etiqueta: 'Choferes',
        icono: UsersIcon,
        roles: ['admin', 'supervisor'],
      },
      { href: '/rutas', etiqueta: 'Rutas', icono: RouteIcon, roles: ['admin', 'supervisor'] },
      { href: '/paradas', etiqueta: 'Paradas', icono: MapPinIcon, roles: ['admin', 'supervisor'] },
    ],
  },
  {
    titulo: 'Analisis',
    enlaces: [
      {
        href: '/reportes/cumplimiento',
        etiqueta: 'Reportes',
        icono: ChartColumnIcon,
        roles: ['admin', 'supervisor'],
      },
      {
        href: '/bitacora',
        etiqueta: 'Bitacora',
        icono: ScrollTextIcon,
        roles: ['admin', 'supervisor'],
      },
      {
        href: '/cuenta',
        etiqueta: 'Mi cuenta',
        icono: UserCogIcon,
        roles: ['admin', 'supervisor', 'chofer'],
      },
    ],
  },
];

/** Contenido compartido por la barra fija (escritorio) y el cajon (movil). */
function ContenidoNav({ rol, onNavegar }: { rol: Rol; onNavegar?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-4">
        <span className="rounded-md bg-white px-2 py-1.5">
          <Image
            src="/tregar-logo.jpg"
            alt="Tregar"
            width={76}
            height={24}
            priority
            className="h-6 w-auto"
          />
        </span>
        <p className="text-xs text-white/60">Portal admin</p>
        {onNavegar ? (
          <button
            type="button"
            onClick={onNavegar}
            aria-label="Cerrar menu"
            className="ml-auto rounded-md p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white md:hidden"
          >
            <XIcon className="size-5" />
          </button>
        ) : null}
      </div>

      <nav aria-label="Navegacion principal" className="min-h-0 flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-5">
          {GRUPOS.map((grupo) => {
            const visibles = grupo.enlaces.filter((enlace) => enlace.roles.includes(rol));
            if (visibles.length === 0) return null;

            return (
              <li key={grupo.titulo}>
                <p className="px-3 pb-1 text-[0.6875rem] font-semibold tracking-wider text-white/40 uppercase">
                  {grupo.titulo}
                </p>
                <ul className="flex flex-col gap-1">
                  {visibles.map((enlace) => {
                    const activo =
                      pathname === enlace.href || pathname.startsWith(`${enlace.href}/`);
                    const Icono = enlace.icono;
                    return (
                      <li key={enlace.href}>
                        <Link
                          href={enlace.href}
                          onClick={onNavegar}
                          aria-current={activo ? 'page' : undefined}
                          className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                            activo
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                              : 'text-white/70 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          <Icono className="size-4 shrink-0" />
                          <span className="truncate">{enlace.etiqueta}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-white/10 p-4 text-xs text-white/40">
        Rutas · Transporte de personal
      </div>
    </>
  );
}

interface Props {
  rol: Rol;
  /** Abre el cajon en movil; en escritorio la barra es fija y siempre visible. */
  abierto: boolean;
  onCerrar: () => void;
  /** Ancho actual de la barra en escritorio, en px. Ignorado en el cajon movil. */
  ancho: number;
  onCambiarAncho: (ancho: number) => void;
}

function acotarAncho(ancho: number): number {
  return Math.min(ANCHO_SIDEBAR_MAX, Math.max(ANCHO_SIDEBAR_MIN, ancho));
}

/** Borde derecho arrastrable de la barra lateral de escritorio. */
function AsaRedimension({
  ancho,
  onCambiarAncho,
}: {
  ancho: number;
  onCambiarAncho: (ancho: number) => void;
}) {
  const arrastrando = useRef(false);

  const alPresionar = useCallback(
    (evento: ReactPointerEvent<HTMLDivElement>) => {
      evento.preventDefault();
      arrastrando.current = true;
      const inicioX = evento.clientX;
      const anchoInicial = ancho;
      const cursorPrevio = document.body.style.cursor;
      const seleccionPrevia = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      function alMover(e: PointerEvent) {
        if (!arrastrando.current) return;
        onCambiarAncho(acotarAncho(anchoInicial + (e.clientX - inicioX)));
      }
      function alSoltar() {
        arrastrando.current = false;
        document.removeEventListener('pointermove', alMover);
        document.removeEventListener('pointerup', alSoltar);
        document.body.style.cursor = cursorPrevio;
        document.body.style.userSelect = seleccionPrevia;
      }
      document.addEventListener('pointermove', alMover);
      document.addEventListener('pointerup', alSoltar);
    },
    [ancho, onCambiarAncho],
  );

  function alPresionarTecla(evento: KeyboardEvent<HTMLDivElement>) {
    const paso = 16;
    if (evento.key === 'ArrowLeft') {
      evento.preventDefault();
      onCambiarAncho(acotarAncho(ancho - paso));
    } else if (evento.key === 'ArrowRight') {
      evento.preventDefault();
      onCambiarAncho(acotarAncho(ancho + paso));
    } else if (evento.key === 'Home') {
      evento.preventDefault();
      onCambiarAncho(ANCHO_SIDEBAR_MIN);
    } else if (evento.key === 'End') {
      evento.preventDefault();
      onCambiarAncho(ANCHO_SIDEBAR_MAX);
    }
  }

  return (
    <div
      role="separator"
      aria-label="Ajustar ancho del menu"
      aria-orientation="vertical"
      aria-valuenow={ancho}
      aria-valuemin={ANCHO_SIDEBAR_MIN}
      aria-valuemax={ANCHO_SIDEBAR_MAX}
      tabIndex={0}
      onPointerDown={alPresionar}
      onKeyDown={alPresionarTecla}
      onDoubleClick={() => onCambiarAncho(ANCHO_SIDEBAR_DEFECTO)}
      className="absolute top-0 right-0 z-10 h-full w-1.5 -mr-0.5 cursor-col-resize touch-none select-none bg-transparent transition-colors hover:bg-white/20 focus-visible:bg-white/30 focus-visible:outline-none active:bg-white/30"
    />
  );
}

export function NavegacionPanel({ rol, abierto, onCerrar, ancho, onCambiarAncho }: Props) {
  return (
    <>
      {/* Escritorio: bloque solido de marca, fijo, de alto completo y ancho
          arrastrable via AsaRedimension. */}
      <aside
        style={{ width: ancho }}
        className="relative hidden h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex"
      >
        <ContenidoNav rol={rol} />
        <AsaRedimension ancho={ancho} onCambiarAncho={onCambiarAncho} />
      </aside>

      {/* Movil: cajon superpuesto. Se cierra desde el propio click que navega
          (cada enlace y el boton de cerrar reciben onNavegar), no como efecto
          del cambio de ruta. */}
      {abierto ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menu"
            tabIndex={-1}
            className="absolute inset-0 h-full w-full cursor-default bg-black/50"
            onClick={onCerrar}
          />
          <aside className="absolute top-0 left-0 flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground shadow-menu">
            <ContenidoNav rol={rol} onNavegar={onCerrar} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
