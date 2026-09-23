import { TZDate } from '@date-fns/tz';
import { asignacion, db, evento, horario } from '@rutas/shared/db';
import { addMinutes, format } from 'date-fns';
import { and, eq, isNull, sql } from 'drizzle-orm';

// Aqui solo dos de los tres tipos: `asignacion_nueva` se encola como efecto
// inmediato de asignar/reasignar, sin necesidad de barrer nada.

const ZONA_OPERATIVA = 'America/Mexico_City';
const MINUTOS_RECORDATORIO = 30;

function fechaOperativa(instante: Date): string {
  return format(new TZDate(instante.getTime(), ZONA_OPERATIVA), 'yyyy-MM-dd');
}

function horaEsperadaComoInstante(fecha: string, horaEsperada: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const [horas, minutos] = horaEsperada.split(':').map(Number);
  return new TZDate(
    anio ?? 1970,
    (mes ?? 1) - 1,
    dia ?? 1,
    horas ?? 0,
    minutos ?? 0,
    0,
    ZONA_OPERATIVA,
  );
}

/**
 * Encola si no hay ya una fila PENDIENTE de ese tipo. El unique parcial
 * `notificacion_programada_pendiente_key` es lo que lo hace idempotente.
 */
async function encolarSiNoExiste(
  asignacionId: string,
  tipo: 'recordatorio_inicio' | 'alerta_retraso',
): Promise<boolean> {
  const insertadas = await db.execute<{ id: string }>(
    sql`insert into notificacion_programada (id, asignacion_id, tipo, enviar_en)
        values (${crypto.randomUUID()}, ${asignacionId}, ${tipo}, now())
        on conflict (asignacion_id, tipo) where enviado_en is null do nothing
        returning id`,
  );
  return insertadas.length > 0;
}

async function asignacionesDeHoySinInicio(fechaHoy: string) {
  const candidatas = await db
    .select({
      id: asignacion.id,
      fecha: asignacion.fecha,
      horaInicioEsperada: horario.horaInicioEsperada,
    })
    .from(asignacion)
    .innerJoin(horario, eq(horario.id, asignacion.horarioId))
    .where(and(eq(asignacion.fecha, fechaHoy), isNull(asignacion.canceladaEn)));

  const resultado: typeof candidatas = [];
  for (const candidata of candidatas) {
    const [yaInicio] = await db
      .select({ id: evento.id })
      .from(evento)
      .where(and(eq(evento.asignacionId, candidata.id), eq(evento.tipo, 'inicio_ruta')))
      .limit(1);
    if (!yaInicio) {
      resultado.push(candidata);
    }
  }
  return resultado;
}

/** recordatorio_inicio: 30 min antes de la hora esperada de inicio. */
export async function programarRecordatorios(ahora: Date = new Date()): Promise<number> {
  const candidatas = await asignacionesDeHoySinInicio(fechaOperativa(ahora));

  let total = 0;
  for (const candidata of candidatas) {
    const horaEsperada = horaEsperadaComoInstante(candidata.fecha, candidata.horaInicioEsperada);
    const disparo = addMinutes(horaEsperada, -MINUTOS_RECORDATORIO);
    if (disparo > ahora) {
      continue;
    }
    if (await encolarSiNoExiste(candidata.id, 'recordatorio_inicio')) {
      total++;
    }
  }
  return total;
}

/** alerta_retraso: la hora esperada de inicio ya paso sin evento inicio_ruta. */
export async function programarAlertasRetraso(ahora: Date = new Date()): Promise<number> {
  const candidatas = await asignacionesDeHoySinInicio(fechaOperativa(ahora));

  let total = 0;
  for (const candidata of candidatas) {
    const horaEsperada = horaEsperadaComoInstante(candidata.fecha, candidata.horaInicioEsperada);
    if (horaEsperada > ahora) {
      continue;
    }
    if (await encolarSiNoExiste(candidata.id, 'alerta_retraso')) {
      total++;
    }
  }
  return total;
}
