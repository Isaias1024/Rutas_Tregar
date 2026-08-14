import { ORDEN_PASOS, siguientePaso, type TipoEvento } from '@rutas/shared';
import { AlertTriangleIcon, CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ETIQUETA_PASO, ICONO_PASO } from './etiquetas-paso';
import { horaTexto } from './formato';

type EstadoPaso = 'completado' | 'activo' | 'pendiente';

interface Props {
  eventos: { tipo: TipoEvento; ocurrioEn: Date }[];
  horaInicioEsperada: string;
  sospechoso: boolean;
}

function circulo(estado: EstadoPaso) {
  if (estado === 'completado') {
    return 'bg-primary text-primary-foreground';
  }
  if (estado === 'activo') {
    return 'border-2 border-primary bg-primary-tint text-primary';
  }
  return 'border border-border bg-background text-muted-foreground';
}

/**
 * Los cinco hitos como linea de tiempo: vertical en mobile (una sola columna
 * legible sin scroll horizontal, §movil), horizontal desde `md` cuando el
 * ancho ya alcanza para los cinco pasos en fila.
 */
export function PasoTimeline({ eventos, horaInicioEsperada, sospechoso }: Props) {
  const eventosPorTipo = new Map(eventos.map((evento) => [evento.tipo, evento]));
  const siguiente = siguientePaso(eventos.map((evento) => ({ tipo: evento.tipo })));

  return (
    <ol className="flex flex-col md:flex-row">
      {ORDEN_PASOS.map((tipo, indice) => {
        const cumplido = eventosPorTipo.get(tipo);
        const estado: EstadoPaso = cumplido
          ? 'completado'
          : tipo === siguiente
            ? 'activo'
            : 'pendiente';
        const esUltimo = indice === ORDEN_PASOS.length - 1;
        const Icono = ICONO_PASO[tipo];

        return (
          <li key={tipo} className="flex gap-3 md:flex-1 md:flex-col md:items-center md:gap-2">
            <div className="flex flex-col items-center md:w-full md:flex-row">
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full',
                  circulo(estado),
                )}
              >
                {estado === 'completado' ? (
                  <CheckIcon aria-hidden="true" className="size-3.5" />
                ) : (
                  <Icono aria-hidden="true" className="size-3.5" />
                )}
              </span>
              {esUltimo ? null : (
                <span
                  aria-hidden="true"
                  className={cn(
                    'w-0.5 flex-1 md:h-0.5 md:w-auto',
                    estado === 'completado' ? 'bg-primary' : 'bg-border',
                  )}
                  style={{ minHeight: 16 }}
                />
              )}
            </div>
            <div className="min-w-0 pb-4 md:px-1 md:pb-0 md:text-center">
              <p
                className={cn(
                  'text-sm',
                  estado === 'pendiente' ? 'text-muted-foreground' : 'font-medium text-foreground',
                )}
              >
                {ETIQUETA_PASO[tipo]}
              </p>
              <p className="text-xs text-muted-foreground">
                {estado === 'completado' && cumplido
                  ? (horaTexto(cumplido.ocurrioEn.getTime()) ?? 'Completado')
                  : estado === 'activo'
                    ? 'En progreso'
                    : 'Sin registrar'}
              </p>
              {tipo === 'inicio_ruta' && horaInicioEsperada ? (
                <p className="text-xs tabular-nums text-muted-foreground">
                  Esperado {horaInicioEsperada.slice(0, 5)}
                </p>
              ) : null}
              {tipo === 'inicio_ruta' && sospechoso ? (
                <p className="flex items-center gap-1 text-xs font-medium text-warning md:justify-center">
                  <AlertTriangleIcon aria-hidden="true" className="size-3 shrink-0" />
                  Hora del dispositivo distinta
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
