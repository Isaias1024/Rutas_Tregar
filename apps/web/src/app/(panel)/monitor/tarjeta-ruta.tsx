import { semaforo } from '@rutas/shared/tokens';
import { TruckIcon, UserRoundIcon } from 'lucide-react';
import { PastillaEstado } from '@/components/pastilla-estado';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PasoTimeline } from './paso-timeline';
import type { FilaMonitor } from './tipos';

const ETIQUETA_TURNO: Record<string, string> = { manana: 'Manana', tarde: 'Tarde', noche: 'Noche' };

interface Props {
  fila: FilaMonitor;
  onRegistrar: () => void;
}

/** Una ruta del monitor: cabecera con su estado + los cinco hitos en detalle (§UI monitor). */
export function TarjetaRuta({ fila, onRegistrar }: Props) {
  return (
    <li>
      <Card
        className="overflow-hidden"
        style={{ borderLeft: `3px solid ${semaforo[fila.estado].bg}` }}
      >
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{fila.rutaNombre}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <UserRoundIcon aria-hidden="true" className="size-3.5 shrink-0" />
                  {ETIQUETA_TURNO[fila.turno] ?? fila.turno} · {fila.choferNombre ?? 'Sin nombre'}
                </span>
                <span className="flex items-center gap-1.5 tabular-nums">
                  <TruckIcon aria-hidden="true" className="size-3.5 shrink-0" />
                  {fila.camionCodigo}
                </span>
              </div>
            </div>
            <PastillaEstado estado={fila.estado} />
          </div>

          <PasoTimeline
            eventos={fila.eventos}
            horaInicioEsperada={fila.horaInicioEsperada}
            sospechoso={fila.sospechoso}
          />

          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onRegistrar}>
              Registrar evento
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
