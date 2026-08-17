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

/**
 * El ciclo de vida de una ruta tal como lo lee un humano en una tarjeta.
 *
 * NO es una sexta columna ni un estado guardado: se deriva de los mismos
 * cinco hitos de `ORDEN_PASOS` (§8 "el estado se deriva, nunca se guarda").
 * Los cinco pasos siguen siendo el motor — enum de Postgres, RLS, monitor del
 * panel y CSV del cliente dependen de ellos; esto solo los agrupa en las
 * cuatro etiquetas que el chofer necesita distinguir de un vistazo.
 */
export type EstadoRuta = 'pendiente' | 'en_curso' | 'completada' | 'cancelada';

/**
 * `cancelada` gana sobre todo lo demas: una asignacion con `cancelada_en`
 * puesto ya no se ejecuta aunque traiga eventos de cuando si estaba vigente.
 * Despues manda el avance: `retorno` (el ultimo hito) la cierra, `inicio_ruta`
 * la pone en curso, y `vio_ruta`/`listo_inicio` todavia son preparacion — la
 * ruta no arranco, asi que sigue pendiente.
 */
export function estadoRuta(
  eventosRegistrados: EventoRegistrado[],
  canceladaEn?: string | null,
): EstadoRuta {
  if (canceladaEn) {
    return 'cancelada';
  }
  const registrados = new Set(eventosRegistrados.map((evento) => evento.tipo));
  if (registrados.has('retorno')) {
    return 'completada';
  }
  if (registrados.has('inicio_ruta')) {
    return 'en_curso';
  }
  return 'pendiente';
}
