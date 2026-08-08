'use client';

import { TZDate } from '@date-fns/tz';
import {
  derivarEstado,
  ORDEN_PASOS,
  type EstadoSemaforo,
  type Resultado,
  type TipoEvento,
} from '@rutas/shared';
import { colores, semaforo } from '@rutas/shared/tokens';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SearchIcon, TruckIcon, UserRoundIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EstadoVacio } from '@/components/estado-vacio';
import { Input } from '@/components/ui/input';
import { PastillaEstado } from '@/components/pastilla-estado';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listarMonitorDelDia, registrarEventoManual } from '@/server/monitor';

const REFRESH_MS = 30_000;
const ORDEN_ESTADOS: EstadoSemaforo[] = [
  'en_curso',
  'tarde',
  'a_tiempo',
  'adelantado',
  'pendiente',
];

const ETIQUETA_TURNO: Record<string, string> = { manana: 'Manana', tarde: 'Tarde', noche: 'Noche' };
const ETIQUETA_PASO: Record<TipoEvento, string> = {
  vio_ruta: 'Vio la ruta',
  listo_inicio: 'Listo para iniciar',
  inicio_ruta: 'Inicio la ruta',
  fin_ruta: 'Llego al final',
  retorno: 'Regreso',
};

function ahoraLocalTexto(): string {
  const ahora = TZDate.tz('America/Mexico_City');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}T${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`;
}

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
  const { texto, icono, fg, bg } = semaforo[estado];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      style={{
        color: fg,
        backgroundColor: activo ? bg : colores.background,
        borderColor: activo ? bg : colores.border,
      }}
    >
      <span aria-hidden="true">{icono}</span>
      {texto}
      <span className="tabular-nums font-semibold">{cantidad}</span>
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
  const [asignacionParaCaptura, setAsignacionParaCaptura] = useState<string | null>(null);
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
    return <p className="text-sm text-muted-foreground">Cargando el monitor...</p>;
  }

  if (filas.length === 0) {
    return <EstadoVacio titulo="No hay rutas programadas hoy" />;
  }

  const actualizado = horaTexto(dataUpdatedAt);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
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
        {actualizado ? (
          <p className="text-xs tabular-nums text-muted-foreground">Actualizado {actualizado}</p>
        ) : null}
      </div>

      <div className="relative max-w-sm">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar ruta, chofer o camion"
          className="pl-8"
          aria-label="Buscar en el monitor"
        />
      </div>

      {filasFiltradas.length === 0 ? (
        <EstadoVacio
          titulo="No hay resultados para tu busqueda"
          accion={
            <Button type="button" variant="outline" size="sm" onClick={limpiarFiltros}>
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="h-10 font-medium">Ruta</th>
                  <th className="h-10 font-medium">Turno</th>
                  <th className="h-10 font-medium">Chofer</th>
                  <th className="h-10 font-medium">Camion</th>
                  <th className="h-10 font-medium">Estado</th>
                  <th className="h-10 font-medium text-right">Captura manual</th>
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.map((fila) => (
                  <tr key={fila.id} className="h-10 border-b border-border">
                    <td>{fila.rutaNombre}</td>
                    <td>{ETIQUETA_TURNO[fila.turno] ?? fila.turno}</td>
                    <td>{fila.choferNombre ?? 'Sin nombre'}</td>
                    <td className="tabular-nums">{fila.camionCodigo}</td>
                    <td>
                      <PastillaEstado estado={fila.estado} />
                    </td>
                    <td className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAsignacionParaCaptura(fila.id)}
                      >
                        Registrar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {filasFiltradas.map((fila) => (
              <li
                key={fila.id}
                className="rounded-lg border border-border py-3 pr-4 pl-3"
                style={{ borderLeft: `3px solid ${semaforo[fila.estado].fg}` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{fila.rutaNombre}</p>
                  <PastillaEstado estado={fila.estado} />
                </div>
                <div className="mt-1.5 space-y-0.5 text-sm text-muted-foreground">
                  <p className="flex items-center gap-1.5">
                    <UserRoundIcon aria-hidden="true" className="size-3.5 shrink-0" />
                    {ETIQUETA_TURNO[fila.turno] ?? fila.turno} · {fila.choferNombre ?? 'Sin nombre'}
                  </p>
                  <p className="flex items-center gap-1.5 tabular-nums">
                    <TruckIcon aria-hidden="true" className="size-3.5 shrink-0" />
                    {fila.camionCodigo}
                  </p>
                </div>
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAsignacionParaCaptura(fila.id)}
                  >
                    Registrar evento
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <DialogoCapturaManual
        asignacionId={asignacionParaCaptura}
        onOpenChange={(abierto) => {
          if (!abierto) setAsignacionParaCaptura(null);
        }}
      />
    </div>
  );
}

interface FormularioCaptura {
  tipo: TipoEvento;
  ocurrioEnLocal: string;
}

function DialogoCapturaManual({
  asignacionId,
  onOpenChange,
}: {
  asignacionId: string | null;
  onOpenChange: (abierto: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormularioCaptura>({
    values: { tipo: 'vio_ruta', ocurrioEnLocal: ahoraLocalTexto() },
  });

  async function guardar(valores: FormularioCaptura) {
    if (!asignacionId) {
      return;
    }
    setPendiente(true);
    setError(null);
    const resultado: Resultado<{ id: string }> = await registrarEventoManual({
      asignacionId,
      tipo: valores.tipo,
      ocurrioEnLocal: valores.ocurrioEnLocal,
    });
    setPendiente(false);
    if (!resultado.ok) {
      setError(resultado.error.mensaje);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['monitor'] });
    onOpenChange(false);
  }

  return (
    <Dialog open={asignacionId !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar evento a mano</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(guardar)} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="captura-manual-tipo" className="text-sm font-medium">
              Paso
            </label>
            <Controller
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="captura-manual-tipo" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDEN_PASOS.map((paso) => (
                      <SelectItem key={paso} value={paso}>
                        {ETIQUETA_PASO[paso]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="captura-manual-hora" className="text-sm font-medium">
              Fecha y hora
            </label>
            <Input
              id="captura-manual-hora"
              type="datetime-local"
              {...form.register('ocurrioEnLocal')}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pendiente}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
