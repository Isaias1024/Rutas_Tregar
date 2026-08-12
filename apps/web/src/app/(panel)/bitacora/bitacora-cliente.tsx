'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EstadoVacio } from '@/components/estado-vacio';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type ActorFiltro, listarBitacora } from '@/server/bitacora';

const TODOS = '__todos__';

function formatoFechaHora(fecha: Date | string): string {
  return new Date(fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' });
}

interface Props {
  actores: ActorFiltro[];
}

// La bitacora de auditoria (§9 paso 16): la unica superficie, junto con el
// reporte de ejecuciones, paginada por cursor (§5). Filtros por recurso y
// por actor, ambos aplicados en el servidor — nunca se trae toda la tabla
// para filtrar en el cliente.
export function BitacoraCliente({ actores }: Props) {
  const [recursoTipo, setRecursoTipo] = useState('');
  const [actorId, setActorId] = useState(TODOS);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['bitacora', recursoTipo, actorId],
      queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
        listarBitacora({
          cursor: pageParam,
          recursoTipo: recursoTipo || undefined,
          actorId: actorId === TODOS ? undefined : actorId,
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (ultimaPagina) => ultimaPagina.cursorSiguiente ?? undefined,
    });

  const filas = data?.pages.flatMap((pagina) => pagina.filas) ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <label htmlFor="bitacora-recurso" className="text-sm font-medium">
              Tipo de recurso
            </label>
            <Input
              id="bitacora-recurso"
              placeholder="asignacion, ruta, usuario..."
              value={recursoTipo}
              onChange={(evento) => setRecursoTipo(evento.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="bitacora-actor" className="text-sm font-medium">
              Actor
            </label>
            <Select value={actorId} onValueChange={setActorId}>
              <SelectTrigger id="bitacora-actor" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {actores.map((actor) => (
                  <SelectItem key={actor.id} value={actor.id}>
                    {actor.nombre ?? actor.credencial}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div
          role="progressbar"
          aria-label="Consultando la bitacora"
          className="h-1 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      ) : isError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          No se pudo consultar la bitacora.
        </p>
      ) : filas.length === 0 ? (
        <Card>
          <EstadoVacio titulo="Sin movimientos con estos filtros" />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Accion</TableHead>
                  <TableHead>Recurso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((fila) => (
                  <TableRow key={fila.id}>
                    <TableCell className="tabular-nums">
                      {formatoFechaHora(fila.createdAt)}
                    </TableCell>
                    <TableCell>{fila.actorNombre ?? fila.actorCredencial}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{fila.accion}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {fila.recursoTipo}:{fila.recursoId}
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
