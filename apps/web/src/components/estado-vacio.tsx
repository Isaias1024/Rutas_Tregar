import type { ReactNode } from 'react';

interface Props {
  titulo: string;
  accion?: ReactNode;
}

/** El estado vacio comun a toda superficie asincrona del panel (§6). */
export function EstadoVacio({ titulo, accion }: Props) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border py-16 text-center">
      <p className="text-sm text-muted-foreground">{titulo}</p>
      {accion}
    </div>
  );
}
