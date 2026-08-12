'use client';

import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { BarraSuperior } from '@/components/shell/barra-superior';
import { NavegacionPanel } from '@/components/shell/navegacion-panel';

type Rol = 'admin' | 'supervisor' | 'chofer';

interface Props {
  nombre: string;
  credencial: string;
  rol: Rol;
  fechaLarga: string;
  accionCerrarSesion: () => Promise<void>;
  children: ReactNode;
}

/**
 * El unico trozo de cliente del marco: existe solo para que la barra lateral y
 * el boton de menu de la barra superior compartan el estado del cajon movil.
 * `children` llega ya renderizado desde el servidor y solo se coloca aqui.
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

  // `h-dvh` + `overflow-hidden`: la barra lateral y la superior quedan fijas y
  // el unico que se desplaza es el area de contenido.
  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <NavegacionPanel rol={rol} abierto={menuAbierto} onCerrar={cerrarMenu} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <BarraSuperior
          nombre={nombre}
          credencial={credencial}
          rol={rol}
          fechaLarga={fechaLarga}
          accionCerrarSesion={accionCerrarSesion}
          onAbrirMenu={() => setMenuAbierto(true)}
        />
        <main className="min-w-0 flex-1 overflow-y-auto bg-surface p-4 sm:p-6">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
