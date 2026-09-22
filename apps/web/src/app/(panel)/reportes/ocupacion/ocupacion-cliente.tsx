'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { colores } from '@rutas/shared/tokens';
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
import { obtenerOcupacionPorRuta } from '@/server/reportes';
import { FiltroRango, type RangoFechas, rangoPorDefecto } from '../filtro-rango';

function redondear(valor: number | null): number | null {
  return valor === null ? null : Math.round(valor * 10) / 10;
}

// Los esperados salen de `horario.personas_esperadas`, nunca de la ruta, y un
// `cnt_abordaron` nulo se excluye del promedio en vez de contar como cero.
export function OcupacionCliente() {
  const [rango, setRango] = useState<RangoFechas>(rangoPorDefecto);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reportes', 'ocupacion', rango.desde, rango.hasta],
    queryFn: () => obtenerOcupacionPorRuta(rango.desde, rango.hasta),
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
        <>
          <Card className="h-80 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke={colores.border} />
                <XAxis dataKey="rutaNombre" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="esperadosPromedio" name="Esperados" fill={colores.fgMuted} />
                <Bar dataKey="abordaronPromedio" name="Abordaron" fill={colores.primary} />
                <Bar dataKey="retornaronPromedio" name="Retornaron" fill={colores.success} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ruta</TableHead>
                  <TableHead className="text-right">Asignaciones</TableHead>
                  <TableHead className="text-right">Esperados (prom.)</TableHead>
                  <TableHead className="text-right">Abordaron (prom.)</TableHead>
                  <TableHead className="text-right">Retornaron (prom.)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((fila) => (
                  <TableRow key={fila.rutaId}>
                    <TableCell>{fila.rutaNombre}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fila.totalAsignaciones}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {redondear(fila.esperadosPromedio)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {redondear(fila.abordaronPromedio) ?? 'Sin datos'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {redondear(fila.retornaronPromedio) ?? 'Sin datos'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
