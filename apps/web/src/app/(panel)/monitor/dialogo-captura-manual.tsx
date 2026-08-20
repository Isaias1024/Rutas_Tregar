'use client';

import { TZDate } from '@date-fns/tz';
import { requiereContador, type Resultado, siguientePaso, type TipoEvento } from '@rutas/shared';
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
import { registrarEventoManual } from '@/server/monitor';
import { ETIQUETA_PASO } from './etiquetas-paso';
import type { FilaMonitor } from './tipos';

function ahoraLocalTexto(): string {
  const ahora = TZDate.tz('America/Mexico_City');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}T${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`;
}

/** Solo "Llegada" (fin_ruta) y "Regreso con" (retorno) piden un contador (§9-10). */
const ETIQUETA_CANTIDAD: Partial<Record<TipoEvento, string>> = {
  fin_ruta: 'Personas que bajan',
  retorno: 'Personas que suben',
};

interface FormularioCaptura {
  ocurrioEnLocal: string;
  cantidad: string;
}

interface Props {
  /** La fila del monitor para la que se va a capturar, con sus eventos ya registrados. */
  fila: FilaMonitor | null;
  onOpenChange: (abierto: boolean) => void;
}

/**
 * El supervisor ya no elige el paso: la pantalla calcula el siguiente con la
 * misma `siguientePaso` que sigue el chofer en la app (§ Eventos en Vivo —
 * registro manual) y solo deja registrar ese. El servidor vuelve a validar
 * la secuencia con `puedeRegistrar` — esto es UI, no la unica frontera.
 */
export function DialogoCapturaManual({ fila, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const siguiente = fila
    ? siguientePaso(fila.eventos.map((evento) => ({ tipo: evento.tipo })))
    : null;
  const necesitaCantidad = siguiente !== null && requiereContador(siguiente);

  const form = useForm<FormularioCaptura>({
    values: { ocurrioEnLocal: ahoraLocalTexto(), cantidad: '' },
  });

  async function guardar(valores: FormularioCaptura) {
    if (!fila || !siguiente) {
      return;
    }
    if (necesitaCantidad && valores.cantidad.trim() === '') {
      setError('Captura la cantidad de personas.');
      return;
    }
    setPendiente(true);
    setError(null);
    const resultado: Resultado<{ id: string }> = await registrarEventoManual({
      asignacionId: fila.id,
      tipo: siguiente,
      ocurrioEnLocal: valores.ocurrioEnLocal,
      ...(necesitaCantidad ? { cantidad: Number(valores.cantidad) } : {}),
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar evento a mano</DialogTitle>
        </DialogHeader>
        {fila ? (
          <p className="-mt-1 text-sm text-muted-foreground">
            Ruta <span className="font-medium text-foreground">{fila.rutaNombre}</span>
          </p>
        ) : null}

        {fila && siguiente === null ? (
          <>
            <p className="text-sm text-muted-foreground">
              Los cinco pasos de esta ruta ya estan registrados.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {fila && siguiente !== null ? (
          <form onSubmit={form.handleSubmit(guardar)} className="space-y-4">
            <div className="space-y-1 rounded-lg border border-border bg-surface px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Proximo evento
              </p>
              <p className="text-base font-semibold text-foreground">{ETIQUETA_PASO[siguiente]}</p>
              {siguiente === 'inicio_ruta' && fila.horaInicioEsperada ? (
                <p className="text-xs tabular-nums text-muted-foreground">
                  Hora programada {fila.horaInicioEsperada.slice(0, 5)}
                </p>
              ) : null}
              {siguiente === 'fin_ruta' && fila.horaFinEsperada ? (
                <p className="text-xs tabular-nums text-muted-foreground">
                  Hora programada {fila.horaFinEsperada.slice(0, 5)}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="captura-manual-hora" className="text-sm font-medium">
                Fecha y hora
              </label>
              <Input
                id="captura-manual-hora"
                type="datetime-local"
                className="tabular-nums"
                // `max` es una ayuda del navegador, no la regla: el servidor
                // vuelve a rechazar una hora futura con `eventoManualSchema`.
                max={ahoraLocalTexto()}
                {...form.register('ocurrioEnLocal')}
              />
            </div>

            {necesitaCantidad ? (
              <div className="space-y-1.5">
                <label htmlFor="captura-manual-cantidad" className="text-sm font-medium">
                  {ETIQUETA_CANTIDAD[siguiente]}
                </label>
                <Input
                  id="captura-manual-cantidad"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="tabular-nums"
                  {...form.register('cantidad')}
                />
              </div>
            ) : null}

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
                {pendiente ? 'Guardando...' : `Registrar ${ETIQUETA_PASO[siguiente].toLowerCase()}`}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
