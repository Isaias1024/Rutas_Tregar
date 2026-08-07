// La maquina de los cinco pasos (§ paso 10). La pantalla no decide nada:
// pinta lo que estas funciones digan.

export type TipoEvento = 'vio_ruta' | 'listo_inicio' | 'inicio_ruta' | 'fin_ruta' | 'retorno';

export const ORDEN_PASOS: readonly TipoEvento[] = [
  'vio_ruta',
  'listo_inicio',
  'inicio_ruta',
  'fin_ruta',
  'retorno',
];

export interface EventoRegistrado {
  tipo: TipoEvento;
}

/**
 * El primer paso de ORDEN_PASOS que todavia no esta en `eventosRegistrados`.
 * Si hay un hueco (por ejemplo, `vio_ruta` y `fin_ruta` registrados pero no
 * `listo_inicio` ni `inicio_ruta`), regresa el hueco — nunca el siguiente de
 * la lista tras el ultimo evento marcado. `null` cuando los cinco ya estan.
 */
export function siguientePaso(eventosRegistrados: EventoRegistrado[]): TipoEvento | null {
  const registrados = new Set(eventosRegistrados.map((evento) => evento.tipo));
  for (const paso of ORDEN_PASOS) {
    if (!registrados.has(paso)) {
      return paso;
    }
  }
  return null;
}

/**
 * Solo se puede registrar el paso que `siguientePaso` senala: rechaza tanto
 * saltarse un paso (marcar `inicio_ruta` sin `listo_inicio`) como repetir uno
 * ya marcado (marcar `vio_ruta` otra vez).
 */
export function puedeRegistrar(tipo: TipoEvento, eventosRegistrados: EventoRegistrado[]): boolean {
  return siguientePaso(eventosRegistrados) === tipo;
}

/** Solo `fin_ruta` y `retorno` piden un contador numerico. */
export function requiereContador(tipo: TipoEvento): boolean {
  return tipo === 'fin_ruta' || tipo === 'retorno';
}
