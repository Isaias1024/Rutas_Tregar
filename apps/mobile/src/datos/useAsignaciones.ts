import { estadoRuta } from '@rutas/shared';
import { useCallback, useEffect, useState } from 'react';
import { almacenSqlite } from '@/outbox/db';
import { type AsignacionDetallada, obtenerAsignaciones } from './asignaciones';
import { combinarConPendientes } from './eventos-locales';
import type { ConteoDia } from '@/componentes/ResumenDia';

export interface EstadoConsulta {
  asignaciones: AsignacionDetallada[];
  cargando: boolean;
  /** `true` solo cuando no se pudo mostrar NADA: ni red ni cache. */
  hayError: boolean;
  refrescando: boolean;
  refrescar: () => Promise<void>;
  reintentar: () => void;
}

/**
 * Carga las asignaciones de un rango y les pega encima los eventos del outbox:
 * el cache es de antes de que el chofer marcara.
 */
export function useAsignaciones(
  fechaInicio: string,
  fechaFin: string,
  incluirCanceladas = false,
): EstadoConsulta {
  const [asignaciones, setAsignaciones] = useState<AsignacionDetallada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [hayError, setHayError] = useState(false);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [filas, pendientes] = await Promise.all([
        obtenerAsignaciones(fechaInicio, fechaFin, incluirCanceladas),
        almacenSqlite.listar(),
      ]);
      setAsignaciones(
        filas.map((fila) => ({
          ...fila,
          eventos: combinarConPendientes(fila.id, fila.eventos, pendientes),
        })),
      );
      setHayError(false);
    } catch {
      // `obtenerAsignaciones` ya absorbe el fallo de red cayendo al cache; si
      // aun asi revienta, es que ni SQLite respondio y no hay nada que pintar.
      setHayError(true);
    }
  }, [fechaInicio, fechaFin, incluirCanceladas]);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    cargar().finally(() => {
      if (activo) {
        setCargando(false);
      }
    });
    return () => {
      activo = false;
    };
  }, [cargar]);

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  }, [cargar]);

  // Reintentar llama a la carga directamente, con el esqueleto puesto: el efecto
  // solo depende del rango de fechas, que es lo que define la consulta.
  const reintentar = useCallback(() => {
    setCargando(true);
    cargar().finally(() => setCargando(false));
  }, [cargar]);

  return { asignaciones, cargando, hayError, refrescando, refrescar, reintentar };
}

/** Las cuatro cifras del resumen, derivadas de los mismos eventos que las tarjetas. */
export function contarPorEstado(asignaciones: AsignacionDetallada[]): ConteoDia {
  let pendientes = 0;
  let enCurso = 0;
  let completadas = 0;
  for (const asignacion of asignaciones) {
    const estado = estadoRuta(asignacion.eventos, asignacion.canceladaEn);
    if (estado === 'pendiente') {
      pendientes += 1;
    } else if (estado === 'en_curso') {
      enCurso += 1;
    } else if (estado === 'completada') {
      completadas += 1;
    }
  }
  return { total: asignaciones.length, pendientes, enCurso, completadas };
}
