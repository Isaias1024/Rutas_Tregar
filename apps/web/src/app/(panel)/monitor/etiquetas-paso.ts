import type { TipoEvento } from '@rutas/shared';
import {
  CheckCircleIcon,
  EyeIcon,
  FlagIcon,
  type LucideIcon,
  PlayIcon,
  RotateCcwIcon,
} from 'lucide-react';

/** Etiqueta visible de cada uno de los cinco hitos (§10), en el orden de `ORDEN_PASOS`. */
export const ETIQUETA_PASO: Record<TipoEvento, string> = {
  vio_ruta: 'Vio la ruta',
  listo_inicio: 'Listo para iniciar',
  inicio_ruta: 'Inicio la ruta',
  fin_ruta: 'Llego al final',
  retorno: 'Regreso',
};

export const ICONO_PASO: Record<TipoEvento, LucideIcon> = {
  vio_ruta: EyeIcon,
  listo_inicio: CheckCircleIcon,
  inicio_ruta: PlayIcon,
  fin_ruta: FlagIcon,
  retorno: RotateCcwIcon,
};
