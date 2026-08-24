import type { Puntualidad } from '@rutas/shared';
import type { EstadoSemaforo } from '@rutas/shared/tokens';
import type { listarMonitorDelDia } from '@/server/monitor';

type FilaAsignacion = Awaited<ReturnType<typeof listarMonitorDelDia>>[number];

/** Una fila de `listarMonitorDelDia` con el semaforo ya derivado (§12). */
export interface FilaMonitor extends FilaAsignacion {
  estado: EstadoSemaforo;
  sospechoso: boolean;
  /** Puntualidad de arranque, independiente de si la ruta ya cerro (§ rediseno "en curso"). */
  puntualidadInicio: Puntualidad | null;
}
