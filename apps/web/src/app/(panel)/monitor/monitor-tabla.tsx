'use client';

import { TZDate } from '@date-fns/tz';
import {
  derivarEstado,
  ORDEN_PASOS,
  type EstadoSemaforo,
  type Resultado,
  type TipoEvento,
} from '@rutas/shared';
import { semaforo } from '@rutas/shared/tokens';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listarMonitorDelDia, registrarEventoManual } from '@/server/monitor';

const REFRESH_MS = 30_000;

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

function PastillaEstado({ estado }: { estado: EstadoSemaforo }) {
  const { texto, icono, fg, bg } = semaforo[estado];
  return (
    <span
      className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color: fg, backgroundColor: bg }}
    >
      <span aria-hidden="true">{icono}</span>
      {texto}
    </span>
  );
}

interface Props {
  fecha: string;
}

export function MonitorTabla({ fecha }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['monitor', fecha],
    queryFn: () => listarMonitorDelDia(fecha),
    refetchInterval: REFRESH_MS,
  });
  const [asignacionParaCaptura, setAsignacionParaCaptura] = useState<string | null>(null);

  const filas = (data ?? []).map((fila) => {
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
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando...</p>;
  }

  if (filas.length === 0) {
    return <EstadoVacio titulo="No hay rutas programadas hoy" />;
  }

  return (
    <div className="space-y-4">
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
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
            {filas.map((fila) => (
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
        {filas.map((fila) => (
          <li key={fila.id} className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-foreground">{fila.rutaNombre}</p>
              <PastillaEstado estado={fila.estado} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {ETIQUETA_TURNO[fila.turno] ?? fila.turno} · {fila.choferNombre ?? 'Sin nombre'} ·{' '}
              <span className="tabular-nums">{fila.camionCodigo}</span>
            </p>
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
