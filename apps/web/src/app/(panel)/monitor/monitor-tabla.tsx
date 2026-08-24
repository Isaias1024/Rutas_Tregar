'use client';

import { derivarEstado, type EstadoSemaforo, type Puntualidad } from '@rutas/shared';
import { colores, semaforo } from '@rutas/shared/tokens';
import { useQuery } from '@tanstack/react-query';
import { SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EstadoVacio } from '@/components/estado-vacio';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { listarMonitorDelDia } from '@/server/monitor';
import { DialogoCapturaManual } from './dialogo-captura-manual';
import { DialogoIncidenteManual } from './dialogo-incidente-manual';
import { horaTexto } from './formato';
import { FilaRuta } from './fila-ruta';
import { ResumenDia } from './resumen-dia';
import type { FilaMonitor } from './tipos';

const REFRESH_MS = 30_000;

type EstadoPrincipal = 'pendiente' | 'en_curso' | 'incidente' | 'terminada';

// Estado principal: de que fase va la ruta. El desempeño (a tiempo / tarde /
// adelantado) es un eje aparte — nunca reemplaza a "Terminada" ni a "En
// curso" como filtro (§ rediseno filtros del monitor). Los tres valores de
// aqui abajo tambien son `EstadoSemaforo` validos, que es lo que deja
// reusar `ChipEstado` sin cambiarlo.
const ORDEN_ESTADOS_PRINCIPALES: Exclude<EstadoPrincipal, 'terminada'>[] = [
  'en_curso',
  'pendiente',
  'incidente',
];
const ORDEN_DESEMPENO: Puntualidad[] = ['a_tiempo', 'tarde', 'adelantado'];

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Terminada = cerro con `retorno` o con `fin_ruta_incidente` (§6 UI monitor). */
function esRutaTerminada(fila: { eventos: { tipo: string }[] }): boolean {
  return fila.eventos.some(
    (evento) => evento.tipo === 'retorno' || evento.tipo === 'fin_ruta_incidente',
  );
}

/**
 * El eje de filtro "estado" (§ rediseno filtros): "Terminada" gana sobre
 * cualquier puntualidad en cuanto cierra, sea por `retorno` o por incidente
 * — el desempeño de como cerro vive aparte, en `puntualidadInicio`.
 */
function estadoPrincipalDe(fila: {
  estado: EstadoSemaforo;
  eventos: { tipo: string }[];
}): EstadoPrincipal {
  if (fila.estado === 'incidente') {
    return 'incidente';
  }
  if (esRutaTerminada(fila)) {
    return 'terminada';
  }
  return fila.estado === 'pendiente' ? 'pendiente' : 'en_curso';
}

function ChipEstado({
  estado,
  cantidad,
  activo,
  onClick,
}: {
  estado: EstadoSemaforo;
  cantidad: number;
  activo: boolean;
  onClick: () => void;
}) {
  const { texto, fg, bg } = semaforo[estado];
  // Activo: la pastilla se rellena con el color pleno del estado, igual que la
  // pastilla de la fila. Inactivo: tarjeta blanca con un punto del color, para
  // que el filtro no compita visualmente con los datos.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      style={{
        color: activo ? fg : colores.fg,
        backgroundColor: activo ? bg : colores.background,
        borderColor: activo ? bg : colores.border,
      }}
    >
      {activo ? null : (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: bg }}
        />
      )}
      {texto}
      <span
        className="rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums"
        style={{
          backgroundColor: activo ? 'rgb(255 255 255 / 0.25)' : colores.surface,
          color: activo ? fg : colores.fgMuted,
        }}
      >
        {cantidad}
      </span>
    </button>
  );
}

/**
 * "Terminadas" no es un `EstadoSemaforo` — por eso es un chip aparte en vez
 * de sumarse a `ORDEN_ESTADOS_PRINCIPALES`, pero pertenece al mismo eje
 * (estado principal, § rediseno filtros del monitor) y usa el mismo gris
 * neutral que la pastilla "Terminada" de la fila.
 */
function ChipTerminadas({
  cantidad,
  activo,
  onClick,
}: {
  cantidad: number;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      style={{
        color: activo ? colores.background : colores.fg,
        backgroundColor: activo ? colores.fgMuted : colores.background,
        borderColor: activo ? colores.fgMuted : colores.border,
      }}
    >
      {activo ? null : (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: colores.fgMuted }}
        />
      )}
      Terminadas
      <span
        className="rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums"
        style={{
          backgroundColor: activo ? 'rgb(255 255 255 / 0.25)' : colores.surface,
          color: activo ? colores.background : colores.fgMuted,
        }}
      >
        {cantidad}
      </span>
    </button>
  );
}

interface Props {
  fecha: string;
}

export function MonitorTabla({ fecha }: Props) {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['monitor', fecha],
    queryFn: () => listarMonitorDelDia(fecha),
    refetchInterval: REFRESH_MS,
  });
  const [capturaPara, setCapturaPara] = useState<FilaMonitor | null>(null);
  const [incidentePara, setIncidentePara] = useState<FilaMonitor | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstados, setFiltroEstados] = useState<Set<EstadoPrincipal>>(new Set());
  const [filtroDesempeno, setFiltroDesempeno] = useState<Set<Puntualidad>>(new Set());

  const filas = useMemo(
    () =>
      (data ?? [])
        .map((fila) => {
          const resultado = derivarEstado({
            eventos: fila.eventos.map((evento) => ({
              tipo: evento.tipo,
              ocurrioEn: evento.ocurrioEn.toISOString(),
              recibidoEn: evento.recibidoEn.toISOString(),
            })),
            horaEsperada: fila.horaInicioEsperada,
            ahora: new Date(),
          });
          return { ...fila, ...resultado };
        })
        // Orden = hora de inicio programada, no de llegada ni de estado; si
        // dos rutas comparten horario, el nombre desempata para que el orden
        // no salte entre refrescos (§2 rediseño monitor).
        .sort(
          (a, b) =>
            a.horaInicioEsperada.localeCompare(b.horaInicioEsperada) ||
            a.rutaNombre.localeCompare(b.rutaNombre),
        ),
    [data],
  );

  const conteosEstado = useMemo(() => {
    const base: Record<EstadoPrincipal, number> = {
      pendiente: 0,
      en_curso: 0,
      terminada: 0,
      incidente: 0,
    };
    for (const fila of filas) {
      base[estadoPrincipalDe(fila)] += 1;
    }
    return base;
  }, [filas]);

  // Solo cuenta rutas en curso: es lo mismo alcance que el filtro de
  // desempeño aplica solo cuando "Terminadas" no esta activo (§5 rediseno
  // filtros), asi el numero del chip nunca promete mas de lo que el filtro
  // por si solo va a mostrar.
  const conteosDesempeno = useMemo(() => {
    const base: Record<Puntualidad, number> = { a_tiempo: 0, tarde: 0, adelantado: 0 };
    for (const fila of filas) {
      if (estadoPrincipalDe(fila) === 'en_curso' && fila.puntualidadInicio) {
        base[fila.puntualidadInicio] += 1;
      }
    }
    return base;
  }, [filas]);

  const resumenDia = useMemo(
    () => ({ total: filas.length, finalizadas: conteosEstado.terminada }),
    [filas, conteosEstado],
  );

  const terminoBusqueda = normalizar(busqueda.trim());
  const filasFiltradas = filas.filter((fila) => {
    const principal = estadoPrincipalDe(fila);
    const hayFiltroEstado = filtroEstados.size > 0;
    const hayFiltroDesempeno = filtroDesempeno.size > 0;

    if (hayFiltroEstado && !filtroEstados.has(principal)) {
      return false;
    }
    if (hayFiltroDesempeno) {
      // Un flag de desempeño sin un estado explicito seleccionado describe
      // una ruta que sigue en curso (§2 rediseno filtros): "A tiempo" sola
      // nunca mezcla rutas ya terminadas. Con un estado explicito (p. ej.
      // "Terminadas") el flag se evalua sobre lo que ya filtro esa linea de
      // arriba, sin agregar un alcance implicito extra.
      if (!hayFiltroEstado && principal !== 'en_curso') {
        return false;
      }
      if (!fila.puntualidadInicio || !filtroDesempeno.has(fila.puntualidadInicio)) {
        return false;
      }
    }
    if (terminoBusqueda === '') {
      return true;
    }
    const texto = normalizar(`${fila.rutaNombre} ${fila.choferNombre ?? ''} ${fila.camionCodigo}`);
    return texto.includes(terminoBusqueda);
  });

  function alternarFiltroEstado(estado: EstadoPrincipal) {
    setFiltroEstados((previo) => {
      const siguiente = new Set(previo);
      if (siguiente.has(estado)) {
        siguiente.delete(estado);
      } else {
        siguiente.add(estado);
      }
      return siguiente;
    });
  }

  function alternarFiltroDesempeno(puntualidad: Puntualidad) {
    setFiltroDesempeno((previo) => {
      const siguiente = new Set(previo);
      if (siguiente.has(puntualidad)) {
        siguiente.delete(puntualidad);
      } else {
        siguiente.add(puntualidad);
      }
      return siguiente;
    });
  }

  function limpiarFiltros() {
    setBusqueda('');
    setFiltroEstados(new Set());
    setFiltroDesempeno(new Set());
  }

  if (isLoading) {
    return (
      <Card>
        <p className="p-10 text-center text-sm text-muted-foreground">Cargando el monitor...</p>
      </Card>
    );
  }

  if (filas.length === 0) {
    return (
      <Card>
        <EstadoVacio titulo="No hay rutas programadas hoy" />
      </Card>
    );
  }

  const actualizado = horaTexto(dataUpdatedAt);
  const hayFiltro = filtroEstados.size > 0 || filtroDesempeno.size > 0 || terminoBusqueda !== '';

  return (
    <div className="flex flex-col gap-4">
      {/* `top: 0` en un `sticky` se ancla al borde INTERNO del padding de
          `main` (no al borde real donde recorta el scroll), asi que quedaba
          un hueco del alto del padding donde la fila anterior seguia
          asomando un instante antes de desaparecer. Un `top` negativo del
          mismo alto que el padding de `main` (p-4 sm:p-6 xl:p-8 2xl:p-10)
          empuja la tarjeta pegada justo hasta ese borde real, sin dejar
          hueco. Solo cambia donde queda al pegarse — nunca antes de que
          empiece a scrollear, que es cuando `top` no aplica. */}
      <div className="sticky -top-4 z-10 bg-surface sm:-top-6 xl:-top-8 2xl:-top-10">
        <Card>
          <CardContent className="flex flex-col gap-2.5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ResumenDia {...resumenDia} />
              {actualizado ? (
                <p className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: colores.success }}
                  />
                  Actualizado {actualizado}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full max-w-xs">
                <SearchIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  type="search"
                  value={busqueda}
                  onChange={(evento) => setBusqueda(evento.target.value)}
                  placeholder="Buscar ruta, chofer o camion"
                  className="h-8 pl-9"
                  aria-label="Buscar en el monitor"
                />
              </div>
              {ORDEN_ESTADOS_PRINCIPALES.map((estado) => (
                <ChipEstado
                  key={estado}
                  estado={estado}
                  cantidad={conteosEstado[estado]}
                  activo={filtroEstados.has(estado)}
                  onClick={() => alternarFiltroEstado(estado)}
                />
              ))}
              <ChipTerminadas
                cantidad={conteosEstado.terminada}
                activo={filtroEstados.has('terminada')}
                onClick={() => alternarFiltroEstado('terminada')}
              />
              <span aria-hidden="true" className="h-5 w-px bg-border" />
              {ORDEN_DESEMPENO.map((puntualidad) => (
                <ChipEstado
                  key={puntualidad}
                  estado={puntualidad}
                  cantidad={conteosDesempeno[puntualidad]}
                  activo={filtroDesempeno.has(puntualidad)}
                  onClick={() => alternarFiltroDesempeno(puntualidad)}
                />
              ))}
              {hayFiltro ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={limpiarFiltros}
                >
                  Limpiar filtros
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {filasFiltradas.length === 0 ? (
        <Card>
          <EstadoVacio
            titulo="No hay resultados para tu busqueda"
            accion={
              <Button type="button" variant="outline" size="sm" onClick={limpiarFiltros}>
                Limpiar filtros
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden border-b border-border bg-surface px-2.5 py-1.5 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase md:grid md:grid-cols-[72px_240px_1fr] md:gap-4">
            <span>Horario</span>
            <span>Ruta</span>
            <span>Datos</span>
          </div>
          <ul className="divide-y divide-border">
            {filasFiltradas.map((fila) => (
              <FilaRuta
                key={fila.id}
                fila={fila}
                onRegistrar={() => setCapturaPara(fila)}
                onTerminarPorIncidente={() => setIncidentePara(fila)}
              />
            ))}
          </ul>
        </Card>
      )}

      <DialogoCapturaManual
        fila={capturaPara}
        onOpenChange={(abierto) => {
          if (!abierto) setCapturaPara(null);
        }}
      />

      <DialogoIncidenteManual
        fila={incidentePara}
        onOpenChange={(abierto) => {
          if (!abierto) setIncidentePara(null);
        }}
      />
    </div>
  );
}
