'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EstadoVacio } from '@/components/estado-vacio';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listarBitacoraEjecuciones } from '@/server/reportes';
import { FiltroRango, type RangoFechas, rangoPorDefecto } from '../filtro-rango';

const ETIQUETA_ORIGEN: Record<string, string> = { app: 'App', supervisor: 'Supervisor' };

function formatoHora(fecha: Date | string | null): string {
  if (!fecha) {
    return '—';
  }
  return new Date(fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

// Esta tabla es un vistazo pagina por pagina; la descarga completa del rango es
// el CSV en streaming de `/api/reportes/ejecuciones.csv`.
export function EjecucionesCliente() {
  const [rango, setRango] = useState<RangoFechas>(rangoPorDefecto);
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['reportes', 'ejecuciones', rango.desde, rango.hasta],
      queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
        listarBitacoraEjecuciones({ desde: rango.desde, hasta: rango.hasta, cursor: pageParam }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (ultimaPagina) => ultimaPagina.cursorSiguiente ?? undefined,
    });

  const filas = data?.pages.flatMap((pagina) => pagina.filas) ?? [];
  const urlCsv = `/api/reportes/ejecuciones.csv?desde=${rango.desde}&hasta=${rango.hasta}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 [&>*:first-child]:flex-1">
        <FiltroRango {...rango} onBuscar={setRango} />
        <Button asChild variant="outline">
          <a href={urlCsv}>Descargar CSV</a>
        </Button>
      </div>

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
      ) : filas.length === 0 ? (
        <Card>
          <EstadoVacio titulo="Sin ejecuciones en este rango" />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Chofer</TableHead>
                  <TableHead>Camion</TableHead>
                  <TableHead>Inicio de ruta</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead className="text-right">Abordaron</TableHead>
                  <TableHead className="text-right">Retornaron</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((fila) => (
                  <TableRow key={fila.id}>
                    <TableCell>{fila.fecha}</TableCell>
                    <TableCell>{fila.rutaNombre}</TableCell>
                    <TableCell>{fila.choferNombre ?? 'Sin nombre'}</TableCell>
                    <TableCell className="tabular-nums">{fila.camionCodigo}</TableCell>
                    <TableCell className="tabular-nums">{formatoHora(fila.inicioRutaEn)}</TableCell>
                    <TableCell>
                      {fila.inicioRutaOrigen ? (
                        <Badge variant="outline">
                          {ETIQUETA_ORIGEN[fila.inicioRutaOrigen] ?? fila.inicioRutaOrigen}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fila.cntAbordaron ?? 'Sin datos'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fila.cntRetornaron ?? 'Sin datos'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {hasNextPage ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                {isFetchingNextPage ? 'Cargando...' : 'Cargar mas'}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
