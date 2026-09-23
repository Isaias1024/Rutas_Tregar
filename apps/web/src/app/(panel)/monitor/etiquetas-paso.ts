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
 * Etiqueta visible de cada tipo de evento. Incluye `fin_ruta_incidente`, que no
 * es un paso de la secuencia pero el monitor tiene que mostrar cuando llega.
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
