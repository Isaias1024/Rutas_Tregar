'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EstadoVacio } from '@/components/estado-vacio';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { obtenerCumplimientoPorChofer } from '@/server/reportes';
import { FiltroRango, type RangoFechas, rangoPorDefecto } from '../filtro-rango';

// `app` y `supervisor` SIEMPRE en columnas separadas: mezclarlos en un total
// invalidaria el argumento de puntualidad frente al cliente.
export function CumplimientoCliente() {
  const [rango, setRango] = useState<RangoFechas>(rangoPorDefecto);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reportes', 'cumplimiento', rango.desde, rango.hasta],
    queryFn: () => obtenerCumplimientoPorChofer(rango.desde, rango.hasta),
  });

  return (
    <div className="space-y-4">
      <FiltroRango {...rango} onBuscar={setRango} />

      {isLoading ? (
        <div
          role="progressbar"
          aria-label={`Consultando ${rango.desde} a ${rango.hasta}`}
          className="h-1 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      ) : isError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          No se pudo consultar el rango {rango.desde} a {rango.hasta}.
        </p>
      ) : !data || data.length === 0 ? (
        <Card>
          <EstadoVacio titulo="Sin ejecuciones en este rango" />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chofer</TableHead>
                <TableHead className="text-right">App — total</TableHead>
                <TableHead className="text-right">App — a tiempo</TableHead>
                <TableHead className="text-right">Supervisor — total</TableHead>
                <TableHead className="text-right">Supervisor — a tiempo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((fila) => (
                <TableRow key={fila.choferId}>
                  <TableCell>{fila.choferNombre ?? 'Sin nombre'}</TableCell>
                  <TableCell className="text-right tabular-nums">{fila.app.total}</TableCell>
                  <TableCell className="text-right tabular-nums">{fila.app.aTiempo}</TableCell>
                  <TableCell className="text-right tabular-nums">{fila.supervisor.total}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fila.supervisor.aTiempo}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
