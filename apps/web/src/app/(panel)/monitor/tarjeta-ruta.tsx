import { offsetEnMinutos, puedeRegistrar } from '@rutas/shared';
import { colores, type EstadoSemaforo, semaforo } from '@rutas/shared/tokens';
import { TruckIcon, UserRoundIcon } from 'lucide-react';
import { PastillaEstado } from '@/components/pastilla-estado';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { horaTexto } from './formato';
import { PasoTimeline } from './paso-timeline';
import type { FilaMonitor } from './tipos';

const ETIQUETA_TURNO: Record<string, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };

interface Props {
  fila: FilaMonitor;
  onRegistrar: () => void;
  onTerminarPorIncidente: () => void;
}

/**
 * Pastilla neutral para una ruta que ya termino: el hecho de que termino no
 * debe competir con la puntualidad de su arranque, que va aparte en
 * `ChipDesempeno` (§6 UI monitor).
 */
function PastillaTerminada() {
  return (
    <span
      className="inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{ color: colores.background, backgroundColor: colores.fgMuted }}
    >
      Terminada
    </span>
  );
}

function ChipDesempeno({ estado, texto }: { estado: EstadoSemaforo; texto: string }) {
  const { fg, bg } = semaforo[estado];
  return (
    <span
      className="inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap"
      style={{ color: fg, backgroundColor: bg }}
    >
      {texto}
    </span>
  );
}

/** Una ruta del monitor: cabecera con su estado + los cinco hitos en detalle (§UI monitor). */
export function TarjetaRuta({ fila, onRegistrar, onTerminarPorIncidente }: Props) {
  // El incidente no es el siguiente paso de nada — se ofrece mientras la ruta
  // no haya cerrado ya, igual que en la app del chofer. `puedeRegistrar` es la
  // misma funcion que impone la regla en el servidor; esto solo evita ofrecer
  // un boton que iba a ser rechazado.
  const puedeTerminarPorIncidente = puedeRegistrar(
    'fin_ruta_incidente',
    fila.eventos.map((evento) => ({ tipo: evento.tipo })),
  );

  // "Terminada" gana sobre la puntualidad de salida en cuanto se registra el
  // retorno. El incidente ya trae su propio texto ("Terminada por
  // incidente") y no se separa en dos pastillas.
  const terminada = fila.eventos.some((evento) => evento.tipo === 'retorno');
  const desempenoTexto = (() => {
    if (!terminada || fila.estado === 'incidente' || fila.estado === 'pendiente') {
      return null;
    }
    if (fila.estado === 'a_tiempo') {
      return semaforo.a_tiempo.texto;
    }
    const inicioRuta = fila.eventos.find((evento) => evento.tipo === 'inicio_ruta');
    if (!inicioRuta) {
      return semaforo[fila.estado].texto;
    }
    const offset = offsetEnMinutos(inicioRuta.ocurrioEn.toISOString(), fila.horaInicioEsperada);
    return `${semaforo[fila.estado].texto} ${offset > 0 ? '+' : ''}${offset} min`;
  })();

  // `fin_ruta_incidente` no pertenece a `ORDEN_PASOS`: no aparece en
  // `PasoTimeline`, y sin esto su hora no se veia en ningun lado de la tarjeta.
  const incidente = fila.eventos.find((evento) => evento.tipo === 'fin_ruta_incidente');
  const horaIncidente = incidente ? horaTexto(incidente.ocurrioEn.getTime()) : null;

  return (
    <li className="@container">
      <Card
        className="overflow-hidden"
        style={{ borderLeft: `3px solid ${semaforo[fila.estado].bg}` }}
      >
        <CardContent className="flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{fila.rutaNombre}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <UserRoundIcon aria-hidden="true" className="size-3 shrink-0" />
                  {ETIQUETA_TURNO[fila.turno] ?? fila.turno} · {fila.choferNombre ?? 'Sin nombre'}
                </span>
                <span className="flex items-center gap-1 tabular-nums">
                  <TruckIcon aria-hidden="true" className="size-3 shrink-0" />
                  {fila.camionCodigo}
                </span>
              </div>
            </div>
            {fila.estado === 'incidente' ? (
              <div className="flex flex-col items-end gap-1">
                <PastillaEstado estado={fila.estado} />
                {horaIncidente ? (
                  <p className="text-[0.6875rem] tabular-nums text-muted-foreground">
                    a las {horaIncidente}
                  </p>
                ) : null}
              </div>
            ) : terminada && desempenoTexto ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <PastillaTerminada />
                <ChipDesempeno estado={fila.estado} texto={desempenoTexto} />
              </div>
            ) : terminada ? (
              <PastillaTerminada />
            ) : (
              <PastillaEstado estado={fila.estado} />
            )}
          </div>

          <PasoTimeline
            eventos={fila.eventos}
            horaInicioEsperada={fila.horaInicioEsperada}
            horaFinEsperada={fila.horaFinEsperada}
            personasEsperadas={fila.personasEsperadas}
            cntAbordaron={fila.cntAbordaron}
            cntRetornaron={fila.cntRetornaron}
            sospechoso={fila.sospechoso}
          />

          <div className="flex flex-wrap justify-end gap-2">
            {puedeTerminarPorIncidente ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={onTerminarPorIncidente}
              >
                Terminar por incidente
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={onRegistrar}
            >
              Registrar evento
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
