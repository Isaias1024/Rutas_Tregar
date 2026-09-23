// Sin `'use server'` a proposito: ahi solo se exportan funciones async, y esta
// devuelve un `ReadableStream`. Solo la importa el route handler del CSV.
import '@/lib/env';
import { clienteSql } from '@rutas/shared/db';
import type { FilaEjecucion } from '@/server/reportes';

const ENCABEZADO_CSV = [
  'fecha',
  'ruta',
  'turno',
  'chofer',
  'camion',
  'hora_inicio_esperada',
  'vio_ruta_en',
  'listo_inicio_en',
  'inicio_ruta_en',
  'inicio_ruta_origen',
  'fin_ruta_en',
  'fin_ruta_origen',
  'cnt_abordaron',
  'retorno_en',
  'retorno_origen',
  'cnt_retornaron',
].join(',');

function celdaCsv(valor: string | number | Date | null): string {
  if (valor === null) {
    return '';
  }
  const texto = valor instanceof Date ? valor.toISOString() : String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function filaACsv(fila: FilaEjecucion): string {
  return [
    fila.fecha,
    fila.rutaNombre,
    fila.turno,
    fila.choferNombre,
    fila.camionCodigo,
    fila.horaInicioEsperada,
    fila.vioRutaEn,
    fila.listoInicioEn,
    fila.inicioRutaEn,
    fila.inicioRutaOrigen,
    fila.finRutaEn,
    fila.finRutaOrigen,
    fila.cntAbordaron,
    fila.retornoEn,
    fila.retornoOrigen,
    fila.cntRetornaron,
  ]
    .map(celdaCsv)
    .join(',');
}

interface RenglonCrudo {
  id: string;
  fecha: string;
  ruta_nombre: string;
  turno: string;
  chofer_nombre: string | null;
  camion_codigo: string;
  hora_inicio_esperada: string;
  cnt_abordaron: number | null;
  cnt_retornaron: number | null;
  vio_ruta_en: Date | null;
  listo_inicio_en: Date | null;
  inicio_ruta_en: Date | null;
  inicio_ruta_origen: string | null;
  fin_ruta_en: Date | null;
  fin_ruta_origen: string | null;
  retorno_en: Date | null;
  retorno_origen: string | null;
}

function renglonAFila(renglon: RenglonCrudo): FilaEjecucion {
  return {
    id: renglon.id,
    fecha: renglon.fecha,
    rutaNombre: renglon.ruta_nombre,
    turno: renglon.turno,
    choferNombre: renglon.chofer_nombre,
    camionCodigo: renglon.camion_codigo,
    horaInicioEsperada: renglon.hora_inicio_esperada,
    vioRutaEn: renglon.vio_ruta_en,
    listoInicioEn: renglon.listo_inicio_en,
    inicioRutaEn: renglon.inicio_ruta_en,
    inicioRutaOrigen: renglon.inicio_ruta_origen,
    finRutaEn: renglon.fin_ruta_en,
    finRutaOrigen: renglon.fin_ruta_origen,
    cntAbordaron: renglon.cnt_abordaron,
    retornoEn: renglon.retorno_en,
    retornoOrigen: renglon.retorno_origen,
    cntRetornaron: renglon.cnt_retornaron,
  };
}

const TAMANO_LOTE_CSV = 500;

/**
 * CSV en streaming de verdad: un cursor de `postgres.js` entrega lotes y cada uno
 * se encola antes de pedir el siguiente, sin que el rango completo viva en memoria.
 */
export function streamBitacoraEjecucionesCsv(
  desde: string,
  hasta: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`${ENCABEZADO_CSV}\n`));

      const sqlCrudo = clienteSql();
      try {
        const consulta = sqlCrudo<RenglonCrudo[]>`
          select
            a.id as id,
            a.fecha as fecha,
            r.nombre as ruta_nombre,
            h.turno as turno,
            pp.nombre as chofer_nombre,
            a.camion_codigo as camion_codigo,
            h.hora_inicio_esperada as hora_inicio_esperada,
            a.cnt_abordaron as cnt_abordaron,
            a.cnt_retornaron as cnt_retornaron,
            max(e.ocurrio_en) filter (where e.tipo = 'vio_ruta') as vio_ruta_en,
            max(e.ocurrio_en) filter (where e.tipo = 'listo_inicio') as listo_inicio_en,
            max(e.ocurrio_en) filter (where e.tipo = 'inicio_ruta') as inicio_ruta_en,
            max(e.origen::text) filter (where e.tipo = 'inicio_ruta') as inicio_ruta_origen,
            max(e.ocurrio_en) filter (where e.tipo = 'fin_ruta') as fin_ruta_en,
            max(e.origen::text) filter (where e.tipo = 'fin_ruta') as fin_ruta_origen,
            max(e.ocurrio_en) filter (where e.tipo = 'retorno') as retorno_en,
            max(e.origen::text) filter (where e.tipo = 'retorno') as retorno_origen
          from asignacion a
          join horario h on h.id = a.horario_id
          join ruta r on r.id = h.ruta_id
          left join perfil_personal pp on pp.usuario_id = a.chofer_id
          left join evento e on e.asignacion_id = a.id
          where a.fecha >= ${desde} and a.fecha <= ${hasta} and a.cancelada_en is null
          group by a.id, r.nombre, h.turno, h.hora_inicio_esperada, pp.nombre
          order by a.fecha desc, a.id desc
        `;

        for await (const lote of consulta.cursor(TAMANO_LOTE_CSV)) {
          const filas = Array.isArray(lote) ? lote : [lote];
          let texto = '';
          for (const renglon of filas) {
            texto += `${filaACsv(renglonAFila(renglon))}\n`;
          }
          controller.enqueue(encoder.encode(texto));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
