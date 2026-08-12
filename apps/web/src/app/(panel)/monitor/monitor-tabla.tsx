'use client';

import { TZDate } from '@date-fns/tz';
import { derivarEstado, type EstadoSemaforo } from '@rutas/shared';
import { colores, semaforo } from '@rutas/shared/tokens';
import { useQuery } from '@tanstack/react-query';
import { SearchIcon, TruckIcon, UserRoundIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EstadoVacio } from '@/components/estado-vacio';
import { PastillaEstado } from '@/components/pastilla-estado';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listarMonitorDelDia } from '@/server/monitor';
import { DialogoCapturaManual } from './dialogo-captura-manual';

const REFRESH_MS = 30_000;
const ORDEN_ESTADOS: EstadoSemaforo[] = [
  'en_curso',
  'tarde',
  'a_tiempo',
  'adelantado',
  'pendiente',
];

const ETIQUETA_TURNO: Record<string, string> = { manana: 'Manana', tarde: 'Tarde', noche: 'Noche' };

function horaTexto(ms: number): string | null {
  if (!ms) return null;
  const ahora = new TZDate(ms, 'America/Mexico_City');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`;
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
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
      className="inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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

interface Props {
  fecha: string;
}

export function MonitorTabla({ fecha }: Props) {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['monitor', fecha],
    queryFn: () => listarMonitorDelDia(fecha),
    refetchInterval: REFRESH_MS,
  });
  const [capturaPara, setCapturaPara] = useState<{ id: string; rutaNombre: string } | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstados, setFiltroEstados] = useState<Set<EstadoSemaforo>>(new Set());

  const filas = useMemo(
    () =>
      (data ?? []).map((fila) => {
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
      }),
    [data],
  );

  const conteos = useMemo(() => {
    const base: Record<EstadoSemaforo, number> = {
      pendiente: 0,
      en_curso: 0,
      a_tiempo: 0,
      tarde: 0,
      adelantado: 0,
    };
    for (const fila of filas) {
      base[fila.estado] += 1;
    }
    return base;
  }, [filas]);

  const terminoBusqueda = normalizar(busqueda.trim());
  const filasFiltradas = filas.filter((fila) => {
    if (filtroEstados.size > 0 && !filtroEstados.has(fila.estado)) {
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
  const hayFiltro = filtroEstados.size > 0 || terminoBusqueda !== '';

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {ORDEN_ESTADOS.map((estado) => (
              <ChipEstado
                key={estado}
                estado={estado}
                cantidad={conteos[estado]}
                activo={filtroEstados.has(estado)}
                onClick={() => alternarFiltro(estado)}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-sm">
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
                placeholder="Buscar ruta, chofer o camion"
                className="pl-9"
                aria-label="Buscar en el monitor"
              />
            </div>
            <div className="flex items-center gap-3">
              {hayFiltro ? (
                <Button type="button" variant="ghost" size="sm" onClick={limpiarFiltros}>
                  Limpiar filtros
                </Button>
              ) : null}
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
          </div>
        </CardContent>
      </Card>

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
        <>
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Turno</TableHead>
                  <TableHead>Chofer</TableHead>
                  <TableHead>Camion</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Captura manual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filasFiltradas.map((fila) => (
                  <TableRow key={fila.id}>
                    <TableCell className="font-medium text-foreground">{fila.rutaNombre}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {ETIQUETA_TURNO[fila.turno] ?? fila.turno}
                    </TableCell>
                    <TableCell>{fila.choferNombre ?? 'Sin nombre'}</TableCell>
                    <TableCell className="tabular-nums">{fila.camionCodigo}</TableCell>
                    <TableCell>
                      <PastillaEstado estado={fila.estado} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCapturaPara({ id: fila.id, rutaNombre: fila.rutaNombre })}
                      >
                        Registrar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <ul className="flex flex-col gap-2.5 md:hidden">
            {filasFiltradas.map((fila) => (
              <li
                key={fila.id}
                className="rounded-lg border border-border bg-card p-3 shadow-tarjeta"
                style={{ borderLeft: `3px solid ${semaforo[fila.estado].bg}` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-medium text-foreground">{fila.rutaNombre}</p>
                  <PastillaEstado estado={fila.estado} />
                </div>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <p className="flex items-center gap-1.5">
                    <UserRoundIcon aria-hidden="true" className="size-3.5 shrink-0" />
                    {ETIQUETA_TURNO[fila.turno] ?? fila.turno} · {fila.choferNombre ?? 'Sin nombre'}
                  </p>
                  <p className="flex items-center gap-1.5 tabular-nums">
                    <TruckIcon aria-hidden="true" className="size-3.5 shrink-0" />
                    {fila.camionCodigo}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => setCapturaPara({ id: fila.id, rutaNombre: fila.rutaNombre })}
                >
                  Registrar evento
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <DialogoCapturaManual
        asignacionId={capturaPara?.id ?? null}
        rutaNombre={capturaPara?.rutaNombre}
        onOpenChange={(abierto) => {
          if (!abierto) setCapturaPara(null);
        }}
      />
    </div>
  );
}
