import { colores } from '@rutas/shared/tokens';
import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClockIcon,
  type LucideIcon,
  RouteIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface Tarjeta {
  etiqueta: string;
  valor: number;
  caption: string;
  icono: LucideIcon;
  color: string;
}

interface Props {
  total: number;
  pendientes: number;
  enEjecucion: number;
  finalizadas: number;
  tarde: number;
}

/**
 * Resumen general del dia (paso previo al listado de rutas). Solo cuenta lo
 * que ya se deriva de `evento` y `derivarEstado`: ninguna cifra nueva se
 * inventa aqui, es la misma fuente que alimenta los chips de filtro.
 */
export function ResumenDia({ total, pendientes, enEjecucion, finalizadas, tarde }: Props) {
  const tarjetas: Tarjeta[] = [
    {
      etiqueta: 'Rutas de hoy',
      valor: total,
      caption: 'Programadas para hoy',
      icono: RouteIcon,
      color: colores.fgMuted,
    },
    {
      etiqueta: 'Pendientes',
      valor: pendientes,
      caption: 'Sin actividad registrada',
      icono: ClockIcon,
      color: colores.fgMuted,
    },
    {
      etiqueta: 'En ejecucion',
      valor: enEjecucion,
      caption: 'En camino ahora mismo',
      icono: ActivityIcon,
      color: colores.warning,
    },
    {
      etiqueta: 'Finalizadas',
      valor: finalizadas,
      caption: 'Completaron los 5 pasos',
      icono: CheckCircle2Icon,
      color: colores.success,
    },
    {
      etiqueta: 'Con retraso',
      valor: tarde,
      caption: 'Salieron fuera de tiempo',
      icono: AlertTriangleIcon,
      color: colores.destructive,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tarjetas.map((tarjeta) => (
        <Card key={tarjeta.etiqueta}>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-muted-foreground">{tarjeta.etiqueta}</p>
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full"
                style={{ backgroundColor: `${tarjeta.color}1A`, color: tarjeta.color }}
              >
                <tarjeta.icono className="size-4" />
              </span>
            </div>
            <p className="text-3xl font-bold tabular-nums text-foreground">{tarjeta.valor}</p>
            <p className="text-xs text-muted-foreground">{tarjeta.caption}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
