'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EstadoVacio } from '@/components/estado-vacio';
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
import { obtenerResumenPorCliente } from '@/server/reportes';
import { FiltroRango, type RangoFechas, rangoPorDefecto } from '../filtro-rango';

// Cada fila puede pedir su PDF, pero la generacion corre en el worker: el boton
// dispara la peticion via el proxy del panel para no exponer el secreto.
export function ResumenClienteTabla() {
  const [rango, setRango] = useState<RangoFechas>(rangoPorDefecto);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reportes', 'cliente', rango.desde, rango.hasta],
    queryFn: () => obtenerResumenPorCliente(rango.desde, rango.hasta),
  });

  async function descargarPdf(clienteId: string, clienteNombre: string) {
    setDescargando(clienteId);
    setErrorDescarga(null);
    try {
      const respuesta = await fetch('/api/reportes/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId, desde: rango.desde, hasta: rango.hasta }),
      });
      if (!respuesta.ok) {
        throw new Error('No se pudo generar el PDF');
      }
      const blob = await respuesta.blob();
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `${clienteNombre}-${rango.desde}-a-${rango.hasta}.pdf`;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch {
      setErrorDescarga(`No se pudo generar el PDF de ${clienteNombre}. Intenta de nuevo.`);
    } finally {
      setDescargando(null);
    }
  }

  return (
    <div className="space-y-4">
      <FiltroRango {...rango} onBuscar={setRango} />
      {errorDescarga ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {errorDescarga}
        </p>
      ) : null}

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
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Asignaciones</TableHead>
                <TableHead className="text-right">App — a tiempo</TableHead>
                <TableHead className="text-right">Supervisor — a tiempo</TableHead>
                <TableHead className="text-right">Abordaron (prom.)</TableHead>
                <TableHead className="text-right">Retornaron (prom.)</TableHead>
                <TableHead className="text-right">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((fila) => (
                <TableRow key={fila.clienteId}>
                  <TableCell>{fila.clienteNombre}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fila.totalAsignaciones}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fila.app.aTiempo} / {fila.app.total}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fila.supervisor.aTiempo} / {fila.supervisor.total}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fila.abordaronPromedio === null
                      ? 'Sin datos'
                      : fila.abordaronPromedio.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fila.retornaronPromedio === null
                      ? 'Sin datos'
                      : fila.retornaronPromedio.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={descargando === fila.clienteId}
                      onClick={() => descargarPdf(fila.clienteId, fila.clienteNombre)}
                    >
                      {descargando === fila.clienteId ? 'Generando...' : 'Descargar'}
                    </Button>
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
