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
 * Carga las asignaciones de un rango y les pega encima los eventos que siguen
 * en el outbox local.
 *
 * Ese ultimo paso es lo que hace que un paso marcado sin senal no "se
 * despinte" al refrescar: `obtenerAsignaciones` cae al cache cuando no hay
 * red, y ese cache es de antes de que el chofer marcara. Sin combinar, la
 * tarjeta volveria a decir PENDIENTE para una ruta que el ya arranco.
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

  // Reintentar vuelve a correr la carga con el esqueleto puesto, en vez de
  // mover un contador que el efecto observe: el efecto solo depende de lo que
  // de verdad define la consulta (el rango de fechas), y el boton llama a la
  // carga directamente.
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
