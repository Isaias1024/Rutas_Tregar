'use client';

import { TZDate } from '@date-fns/tz';
import {
  ETIQUETA_INCIDENTE,
  OPCIONES_INCIDENTE,
  type Resultado,
  type TipoIncidente,
} from '@rutas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { registrarIncidenteManual } from '@/server/monitor';
import type { FilaMonitor } from './tipos';

function ahoraLocalTexto(): string {
  const ahora = TZDate.tz('America/Mexico_City');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}T${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`;
}

interface FormularioIncidente {
  ocurrioEnLocal: string;
  razonIncidente: TipoIncidente | '';
}

interface Props {
  /** La fila del monitor cuya ruta se va a cerrar por incidente. */
  fila: FilaMonitor | null;
  onOpenChange: (abierto: boolean) => void;
}

/**
 * Cierra una ruta por incidente desde el panel.
 *
 * Deliberadamente separado de `DialogoCapturaManual`: ese ofrece el siguiente
 * paso de la secuencia y este no participa de la secuencia en absoluto. Aqui
 * no hay "proximo evento" que mostrar — hay una razon que elegir, que es lo
 * unico que este evento pide y que ningun hito normal pide.
 *
 * Existe porque el chofer no siempre puede reportarlo el mismo: si el
 * telefono se quedo sin bateria, o el chofer esta atendiendo la emergencia,
 * la ruta se quedaba abierta para siempre.
 */
export function DialogoIncidenteManual({ fila, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormularioIncidente>({
    values: { ocurrioEnLocal: ahoraLocalTexto(), razonIncidente: '' },
  });

  async function guardar(valores: FormularioIncidente) {
    if (!fila) {
      return;
    }
    if (valores.razonIncidente === '') {
      setError('Elige la razon del incidente.');
      return;
    }
    setPendiente(true);
    setError(null);
    const resultado: Resultado<{ id: string }> = await registrarIncidenteManual({
      asignacionId: fila.id,
      ocurrioEnLocal: valores.ocurrioEnLocal,
      razonIncidente: valores.razonIncidente,
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
    <Dialog open={fila !== null} onOpenChange={onOpenChange}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Terminar ruta por incidente</DialogTitle>
        </DialogHeader>
        {fila ? (
          <p className="-mt-1 text-sm text-muted-foreground">
            Ruta <span className="font-medium text-foreground">{fila.rutaNombre}</span>
          </p>
        ) : null}

        {fila ? (
          <form onSubmit={form.handleSubmit(guardar)} className="space-y-4">
            <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-foreground">
              La ruta se cierra sin completarse y deja de aceptar hitos. El evento queda con origen{' '}
              <span className="font-medium">supervisor</span>, no como si lo hubiera marcado el
              chofer.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="incidente-manual-razon" className="text-sm font-medium">
                Razon
              </label>
              <Select
                value={form.watch('razonIncidente')}
                onValueChange={(valor) =>
                  form.setValue('razonIncidente', valor as TipoIncidente, { shouldDirty: true })
                }
              >
                <SelectTrigger id="incidente-manual-razon" className="w-full">
                  <SelectValue placeholder="Elige una razon" />
                </SelectTrigger>
                <SelectContent>
                  {OPCIONES_INCIDENTE.map((tipo) => (
                    <SelectItem key={tipo} value={tipo}>
                      {ETIQUETA_INCIDENTE[tipo]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="incidente-manual-hora" className="text-sm font-medium">
                Fecha y hora
              </label>
              <Input
                id="incidente-manual-hora"
                type="datetime-local"
                className="tabular-nums"
                // `max` es una ayuda del navegador, no la regla: el servidor
                // vuelve a rechazar una hora futura con `incidenteManualSchema`.
                max={ahoraLocalTexto()}
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
              <Button type="submit" variant="destructive" disabled={pendiente}>
                {pendiente ? 'Guardando...' : 'Terminar por incidente'}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
