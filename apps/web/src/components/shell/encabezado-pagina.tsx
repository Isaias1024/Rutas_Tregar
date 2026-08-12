import type { ReactNode } from 'react';

interface Props {
  titulo: string;
  descripcion?: string;
  /** Acciones alineadas a la derecha del titulo (botones, filtros de rango). */
  acciones?: ReactNode;
}

/**
 * Encabezado unico de toda pagina del panel. Existe para que las doce pantallas
 * no diverjan en tamano de titulo ni en donde cae el boton primario.
 */
export function EncabezadoPagina({ titulo, descripcion, acciones }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">{titulo}</h1>
        {descripcion ? <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p> : null}
      </div>
      {acciones ? <div className="flex shrink-0 items-center gap-2">{acciones}</div> : null}
    </div>
  );
}
