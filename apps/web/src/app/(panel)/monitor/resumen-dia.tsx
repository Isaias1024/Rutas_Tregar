interface Props {
  total: number;
  finalizadas: number;
}

/**
 * Solo las dos cifras que los chips de estado no dan: el total y cuantas ya
 * terminaron. El resto ya lo lleva el contador de cada chip de filtro.
 */
export function ResumenDia({ total, finalizadas }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <p className="flex items-baseline gap-1.5 text-xs text-muted-foreground">
        <span className="text-sm font-semibold tabular-nums text-foreground">{total}</span>
        rutas hoy
      </p>
      <p className="flex items-baseline gap-1.5 text-xs text-muted-foreground">
        <span className="text-sm font-semibold tabular-nums text-foreground">{finalizadas}</span>
        terminadas
      </p>
    </div>
  );
}
