// La maquina de los cinco pasos: la pantalla no decide nada, pinta lo que
// estas funciones digan.

export type TipoEvento =
  | 'vio_ruta'
  | 'listo_inicio'
  | 'inicio_ruta'
  | 'fin_ruta'
  | 'fin_ruta_incidente'
  | 'retorno';
export type TipoIncidente = 'emergencia_personal' | 'choque' | 'trafico' | 'otro';

export const ORDEN_PASOS: readonly TipoEvento[] = [
  'vio_ruta',
  'listo_inicio',
  'inicio_ruta',
  'fin_ruta',
  'retorno',
];

export const OPCIONES_INCIDENTE: readonly TipoIncidente[] = [
  'emergencia_personal',
  'choque',
  'trafico',
  'otro',
];

export const ETIQUETA_INCIDENTE: Record<TipoIncidente, string> = {
  emergencia_personal: 'Emergencia Personal',
  choque: 'Choque',
  trafico: 'Tráfico',
  otro: 'Otro',
};

export interface EventoRegistrado {
  tipo: TipoEvento;
}

/**
 * El primer paso de ORDEN_PASOS que falta, incluso si quedo un hueco atras de
 * un evento ya marcado. `null` con los cinco listos o con incidente registrado.
 */
export function siguientePaso(eventosRegistrados: EventoRegistrado[]): TipoEvento | null {
  const registrados = new Set(eventosRegistrados.map((evento) => evento.tipo));
  // Si hay incidente, la ruta esta cerrada
  if (registrados.has('fin_ruta_incidente')) {
    return null;
  }
  for (const paso of ORDEN_PASOS) {
    if (!registrados.has(paso)) {
      return paso;
    }
  }
  return null;
}

/**
 * Solo se registra el paso que `siguientePaso` senala. EXCEPCION:
 * `fin_ruta_incidente` va en cualquier momento, salvo con la ruta ya cerrada.
 */
export function puedeRegistrar(tipo: TipoEvento, eventosRegistrados: EventoRegistrado[]): boolean {
  if (tipo === 'fin_ruta_incidente') {
    const registrados = new Set(eventosRegistrados.map((evento) => evento.tipo));
    return !registrados.has('retorno') && !registrados.has('fin_ruta_incidente');
  }
  return siguientePaso(eventosRegistrados) === tipo;
}

/** Solo `fin_ruta` y `retorno` piden un contador numerico. */
export function requiereContador(tipo: TipoEvento): boolean {
  return tipo === 'fin_ruta' || tipo === 'retorno';
}

/**
 * El ciclo de vida de una ruta como lo lee un humano. NO es un estado guardado:
 * agrupa los cinco hitos de `ORDEN_PASOS` en las etiquetas que ve el chofer.
 */
export type EstadoRuta = 'pendiente' | 'en_curso' | 'completada' | 'cancelada';

/**
 * `cancelada` gana sobre todo lo demas, aunque traiga eventos de cuando estaba
 * vigente. Despues manda el avance: vio_ruta/listo_inicio siguen siendo pendiente.
 */
export function estadoRuta(
  eventosRegistrados: EventoRegistrado[],
  canceladaEn?: string | null,
): EstadoRuta {
  if (canceladaEn) {
    return 'cancelada';
  }
  const registrados = new Set(eventosRegistrados.map((evento) => evento.tipo));
  if (registrados.has('retorno') || registrados.has('fin_ruta_incidente')) {
    return 'completada';
  }
  if (registrados.has('inicio_ruta')) {
    return 'en_curso';
  }
  return 'pendiente';
}
