interface Props {
  total: number;
  finalizadas: number;
}

/**
 * Resumen minimo del dia: solo las dos cifras que los chips de estado no dan
 * (el total y cuantas ya terminaron). El resto — pendientes, en curso, tarde,
 * incidente — ya lo muestra el contador de cada chip de filtro; duplicarlo
 * aqui era la redundancia que el rediseño del monitor elimina (§7 UI monitor).
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
