import { offsetEnMinutos, puedeRegistrar, siguientePaso } from '@rutas/shared';
import { colores, type EstadoSemaforo, semaforo } from '@rutas/shared/tokens';
import { TruckIcon, UserRoundIcon } from 'lucide-react';
import { PastillaEstado } from '@/components/pastilla-estado';
import { Button } from '@/components/ui/button';
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

/**
 * Una fila del monitor: Horario | Ruta | Datos (estado + los cinco hitos en
 * detalle), §rediseño monitor. `@container` en el `<li>` es lo que deja que
 * `PasoTimeline` decida vertical vs. horizontal segun el ancho real de la
 * columna de datos, no el de la ventana.
 */
export function FilaRuta({ fila, onRegistrar, onTerminarPorIncidente }: Props) {
  // El incidente no es el siguiente paso de nada — se ofrece mientras la ruta
  // no haya cerrado ya, igual que en la app del chofer. `puedeRegistrar` es la
  // misma funcion que impone la regla en el servidor; esto solo evita ofrecer
  // un boton que iba a ser rechazado.
  const puedeTerminarPorIncidente = puedeRegistrar(
    'fin_ruta_incidente',
    fila.eventos.map((evento) => ({ tipo: evento.tipo })),
  );

  // Sin siguiente paso (retorno ya registrado, o cerrada por incidente): no
  // hay nada que "Registrar evento" pueda ofrecer, y `siguientePaso` es la
  // misma funcion que decide eso en el servidor.
  const puedeRegistrarEvento =
    siguientePaso(fila.eventos.map((evento) => ({ tipo: evento.tipo }))) !== null;

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
  // `PasoTimeline`, y sin esto su hora no se veia en ningun lado de la fila.
  const incidente = fila.eventos.find((evento) => evento.tipo === 'fin_ruta_incidente');
  const horaIncidente = incidente ? horaTexto(incidente.ocurrioEn.getTime()) : null;

  const horaInicioTexto = fila.horaInicioEsperada.slice(0, 5);

  return (
    <li className="@container">
      <div
        className="grid grid-cols-1 gap-2 border-l-[3px] p-3 md:grid-cols-[72px_240px_1fr] md:items-start md:gap-4 md:p-2.5"
        style={{ borderLeftColor: semaforo[fila.estado].bg }}
      >
        <div className="flex items-center gap-2 md:block">
          <p className="text-sm font-semibold tabular-nums text-foreground">{horaInicioTexto}</p>
          <span className="text-[0.6875rem] text-muted-foreground md:hidden">
            {ETIQUETA_TURNO[fila.turno] ?? fila.turno}
          </span>
        </div>

        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{fila.rutaNombre}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            <span className="hidden items-center gap-1 md:flex">
              <UserRoundIcon aria-hidden="true" className="size-3 shrink-0" />
              {ETIQUETA_TURNO[fila.turno] ?? fila.turno}
            </span>
            <span className="flex items-center gap-1">
              <UserRoundIcon aria-hidden="true" className="size-3 shrink-0 md:hidden" />
              {fila.choferNombre ?? 'Sin nombre'}
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              <TruckIcon aria-hidden="true" className="size-3 shrink-0" />
              {fila.camionCodigo}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {fila.estado === 'incidente' ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <PastillaEstado estado={fila.estado} />
                {horaIncidente ? (
                  <span className="text-[0.6875rem] tabular-nums text-muted-foreground">
                    a las {horaIncidente}
                  </span>
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
              {puedeRegistrarEvento ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={onRegistrar}
                >
                  Registrar evento
                </Button>
              ) : null}
            </div>
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
        </div>
      </div>
    </li>
  );
}
