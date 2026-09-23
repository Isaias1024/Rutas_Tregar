'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { BarraSuperior } from '@/components/shell/barra-superior';
import { ANCHO_SIDEBAR_DEFECTO, NavegacionPanel } from '@/components/shell/navegacion-panel';

type Rol = 'admin' | 'supervisor' | 'chofer';

interface Props {
  nombre: string;
  credencial: string;
  rol: Rol;
  fechaLarga: string;
  accionCerrarSesion: () => Promise<void>;
  children: ReactNode;
}

const CLAVE_ANCHO_SIDEBAR = 'rutas:ancho-sidebar';

/**
 * El unico trozo de cliente del marco: comparte el estado del cajon movil entre
 * barra lateral y barra superior, y conserva el ancho arrastrado al navegar.
 */
export function MarcoPanel({
  nombre,
  credencial,
  rol,
  fechaLarga,
  accionCerrarSesion,
  children,
}: Props) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const cerrarMenu = useCallback(() => setMenuAbierto(false), []);

  const [anchoSidebar, setAnchoSidebar] = useState(ANCHO_SIDEBAR_DEFECTO);

  // El ancho preferido se lee del navegador, no del servidor: evita el desajuste
  // de hidratacion contra lo que localStorage tiene en esta maquina.
  useEffect(() => {
    const guardado = Number(window.localStorage.getItem(CLAVE_ANCHO_SIDEBAR));
    if (Number.isFinite(guardado) && guardado > 0) {
      setAnchoSidebar(guardado);
    }
  }, []);

  const cambiarAnchoSidebar = useCallback((ancho: number) => {
    setAnchoSidebar(ancho);
    window.localStorage.setItem(CLAVE_ANCHO_SIDEBAR, String(ancho));
  }, []);

  // `h-dvh` + `overflow-hidden`: la barra lateral y la superior quedan fijas y
  // el unico que se desplaza es el area de contenido.
  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <NavegacionPanel
        rol={rol}
        abierto={menuAbierto}
        onCerrar={cerrarMenu}
        ancho={anchoSidebar}
        onCambiarAncho={cambiarAnchoSidebar}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <BarraSuperior
          nombre={nombre}
          credencial={credencial}
          rol={rol}
          fechaLarga={fechaLarga}
          accionCerrarSesion={accionCerrarSesion}
          onAbrirMenu={() => setMenuAbierto(true)}
        />
        {/* Sin contenedor de ancho maximo: el area de contenido usa todo el
            espacio que la barra lateral le deja, de un telefono a una TV 4K. */}
        <main className="min-w-0 flex-1 overflow-y-auto bg-surface p-4 sm:p-6 xl:p-8 2xl:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}
