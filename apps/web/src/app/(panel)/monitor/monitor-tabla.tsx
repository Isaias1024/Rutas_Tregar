'use client';

import { derivarEstado, type EstadoSemaforo } from '@rutas/shared';
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
const ORDEN_ESTADOS: EstadoSemaforo[] = ['en_curso', 'tarde', 'a_tiempo', 'pendiente', 'incidente'];

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
 * "Terminadas" no es un `EstadoSemaforo` — es otro eje (avance vs. puntualidad,
 * §6 UI monitor) — por eso es un chip aparte en vez de sumarse a `ORDEN_ESTADOS`,
 * y usa el mismo gris neutral que la pastilla "Terminada" de la tarjeta.
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
  const [filtroEstados, setFiltroEstados] = useState<Set<EstadoSemaforo>>(new Set());
  const [soloTerminadas, setSoloTerminadas] = useState(false);

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

  const conteos = useMemo(() => {
    const base: Record<EstadoSemaforo, number> = {
      pendiente: 0,
      en_curso: 0,
      a_tiempo: 0,
      tarde: 0,
      adelantado: 0,
      incidente: 0,
    };
    for (const fila of filas) {
      base[fila.estado] += 1;
    }
    return base;
  }, [filas]);

  const resumenDia = useMemo(() => {
    let finalizadas = 0;
    for (const fila of filas) {
      if (esRutaTerminada(fila)) {
        finalizadas += 1;
      }
    }
    return { total: filas.length, finalizadas };
  }, [filas]);

  const terminoBusqueda = normalizar(busqueda.trim());
  const filasFiltradas = filas.filter((fila) => {
    if (filtroEstados.size > 0 && !filtroEstados.has(fila.estado)) {
      return false;
    }
    if (soloTerminadas && !esRutaTerminada(fila)) {
      return false;
    }
    if (terminoBusqueda === '') {
      return true;
    }
    const texto = normalizar(`${fila.rutaNombre} ${fila.choferNombre ?? ''} ${fila.camionCodigo}`);
    return texto.includes(terminoBusqueda);
  });

  function alternarFiltro(estado: EstadoSemaforo) {
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

  function limpiarFiltros() {
    setBusqueda('');
    setFiltroEstados(new Set());
    setSoloTerminadas(false);
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
  const hayFiltro = filtroEstados.size > 0 || soloTerminadas || terminoBusqueda !== '';

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
              {ORDEN_ESTADOS.map((estado) => (
                <ChipEstado
                  key={estado}
                  estado={estado}
                  cantidad={conteos[estado]}
                  activo={filtroEstados.has(estado)}
                  onClick={() => alternarFiltro(estado)}
                />
              ))}
              <ChipTerminadas
                cantidad={resumenDia.finalizadas}
                activo={soloTerminadas}
                onClick={() => setSoloTerminadas((previo) => !previo)}
              />
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
