import { ORDEN_PASOS, type TipoEvento } from '@rutas/shared';
import type { EventoDeRuta } from './asignaciones';
import type { FilaPendiente } from '@/outbox/db';

// Se reexporta para que quien combine eventos no tenga que importar el tipo
// de otro modulo distinto del que le da la funcion.
export type { EventoDeRuta };

/**
 * Los hitos de una asignacion combinando lo que el servidor ya sabe con lo
 * que sigue en el outbox local.
 *
 * Sin esto, un chofer sin senal marca un paso y la lista se lo "des-marca" al
 * refrescar, porque el servidor todavia no lo tiene — justo el escenario para
 * el que existe el outbox (§ movil-expo.md: "la UI avanza al instante, sin
 * esperar red"). El pendiente local gana sobre el remoto porque es igual de
 * real y siempre es mas nuevo.
 *
 * Devuelve en el orden de `ORDEN_PASOS`, no en el de llegada: es el mismo
 * orden en que la linea de tiempo los pinta.
 */
export function combinarConPendientes(
  asignacionId: string,
  remotos: EventoDeRuta[],
  pendientes: FilaPendiente[],
): EventoDeRuta[] {
  const porTipo = new Map<TipoEvento, EventoDeRuta>();
  for (const evento of remotos) {
    porTipo.set(evento.tipo, evento);
  }
  for (const fila of pendientes) {
    if (fila.payload.asignacion_id === asignacionId) {
      porTipo.set(fila.payload.tipo, {
        tipo: fila.payload.tipo,
        ocurrioEn: fila.payload.ocurrio_en,
        lat: fila.payload.lat ?? undefined,
        lng: fila.payload.lng ?? undefined,
        sinGps: fila.payload.sin_gps ?? false,
      });
    }
  }
  return ORDEN_PASOS.filter((tipo) => porTipo.has(tipo)).map(
    (tipo) => porTipo.get(tipo) as EventoDeRuta,
  );
}

/** La hora del hito indicado, o `null` si todavia no se marca. */
export function horaDelPaso(eventos: EventoDeRuta[], tipo: TipoEvento): string | null {
  return eventos.find((evento) => evento.tipo === tipo)?.ocurrioEn ?? null;
}
