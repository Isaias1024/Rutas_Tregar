import { InboxIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}

/**
 * El estado vacio comun a toda superficie asincrona del panel. Sin borde ni
 * fondo propios: siempre se pinta dentro de una `Card`, que pone la superficie.
 */
export function EstadoVacio({ titulo, descripcion, accion }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"
      >
        <InboxIcon className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{titulo}</p>
        {descripcion ? <p className="text-sm text-muted-foreground">{descripcion}</p> : null}
      </div>
      {accion ? <div className="mt-1">{accion}</div> : null}
    </div>
  );
}
