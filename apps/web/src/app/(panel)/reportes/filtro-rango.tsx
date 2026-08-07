'use client';

import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface RangoFechas {
  desde: string;
  hasta: string;
}

interface Props extends RangoFechas {
  onBuscar: (rango: RangoFechas) => void;
}

/** El filtro de rango compartido por las cuatro pantallas de reportes (§6). */
export function FiltroRango({ desde, hasta, onBuscar }: Props) {
  const form = useForm<RangoFechas>({ values: { desde, hasta } });

  return (
    <form
      onSubmit={form.handleSubmit(onBuscar)}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3"
    >
      <div className="space-y-1">
        <label htmlFor="reportes-desde" className="text-sm font-medium">
          Desde
        </label>
        <Input id="reportes-desde" type="date" {...form.register('desde')} />
      </div>
      <div className="space-y-1">
        <label htmlFor="reportes-hasta" className="text-sm font-medium">
          Hasta
        </label>
        <Input id="reportes-hasta" type="date" {...form.register('hasta')} />
      </div>
      <Button type="submit">Buscar</Button>
    </form>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function aFechaTexto(fecha: Date): string {
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

/** Rango por defecto al abrir cualquier reporte: los ultimos 30 dias. */
export function rangoPorDefecto(): RangoFechas {
  const hoy = new Date();
  const hace30 = new Date(hoy);
  hace30.setDate(hoy.getDate() - 30);
  return { desde: aFechaTexto(hace30), hasta: aFechaTexto(hoy) };
}
