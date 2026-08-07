'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EstadoVacio } from '@/components/estado-vacio';
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

// Reporte 1 (§9 paso 15): cumplimiento por chofer, con `app` y `supervisor`
// SIEMPRE en columnas separadas — mezclarlos en un total invalidaria el
// argumento de puntualidad frente al cliente (§16, riesgo "los reportes
// mezclan dos calidades de dato").
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
        <p className="text-sm text-destructive">
          No se pudo consultar el rango {rango.desde} a {rango.hasta}.
        </p>
      ) : !data || data.length === 0 ? (
        <EstadoVacio titulo="Sin ejecuciones en este rango" />
      ) : (
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
                <TableCell className="text-right tabular-nums">{fila.supervisor.aTiempo}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
