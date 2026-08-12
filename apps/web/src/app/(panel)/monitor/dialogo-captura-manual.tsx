'use client';

import { TZDate } from '@date-fns/tz';
import { ORDEN_PASOS, type Resultado, type TipoEvento } from '@rutas/shared';
import { useQueryClient } from '@tanstack/react-query';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { registrarEventoManual } from '@/server/monitor';

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

interface FormularioCaptura {
  tipo: TipoEvento;
  ocurrioEnLocal: string;
}

interface Props {
  asignacionId: string | null;
  /** Nombre de la ruta, solo para que el supervisor confirme que captura en la fila correcta. */
  rutaNombre?: string;
  onOpenChange: (abierto: boolean) => void;
}

export function DialogoCapturaManual({ asignacionId, rutaNombre, onOpenChange }: Props) {
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
        {rutaNombre ? (
          <p className="-mt-1 text-sm text-muted-foreground">
            Ruta <span className="font-medium text-foreground">{rutaNombre}</span>
          </p>
        ) : null}
        <form onSubmit={form.handleSubmit(guardar)} className="space-y-4">
          <div className="space-y-1.5">
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

          <div className="space-y-1.5">
            <label htmlFor="captura-manual-hora" className="text-sm font-medium">
              Fecha y hora
            </label>
            <Input
              id="captura-manual-hora"
              type="datetime-local"
              className="tabular-nums"
              {...form.register('ocurrioEnLocal')}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
