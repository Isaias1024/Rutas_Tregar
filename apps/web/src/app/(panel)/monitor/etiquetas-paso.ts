import type { TipoEvento } from '@rutas/shared';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  EyeIcon,
  FlagIcon,
  type LucideIcon,
  PlayIcon,
  RotateCcwIcon,
} from 'lucide-react';

/**
 * Etiqueta visible de cada tipo de evento (§10): los cinco hitos en el orden de `ORDEN_PASOS`, mas
 * `fin_ruta_incidente`, que no es un paso de la secuencia sino la salida de emergencia y por eso
 * `siguientePaso()` nunca lo propone. Se etiqueta igual porque el monitor lo tiene que **mostrar**
 * cuando llega desde la app.
 */
export const ETIQUETA_PASO: Record<TipoEvento, string> = {
  vio_ruta: 'Vio la ruta',
  listo_inicio: 'Listo para iniciar',
  inicio_ruta: 'Inicio la ruta',
  fin_ruta: 'Llego al final',
  fin_ruta_incidente: 'Finalizo con incidente',
  retorno: 'Regreso',
};

export const ICONO_PASO: Record<TipoEvento, LucideIcon> = {
  vio_ruta: EyeIcon,
  listo_inicio: CheckCircleIcon,
  inicio_ruta: PlayIcon,
  fin_ruta: FlagIcon,
  fin_ruta_incidente: AlertCircleIcon,
  retorno: RotateCcwIcon,
};
