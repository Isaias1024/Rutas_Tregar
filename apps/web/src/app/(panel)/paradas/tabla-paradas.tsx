'use client';

import type { Resultado } from '@rutas/shared';
import { useState, useTransition } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EstadoVacio } from '@/components/estado-vacio';
import { type Coordenadas, SelectorParada } from '@/components/mapa/selector-parada';

interface Parada {
  id: string;
  nombre: string;
  direccion: string;
  lat: number;
  lng: number;
}

interface Props {
  paradas: Parada[];
  accionCrear: (input: unknown) => Promise<Resultado<{ id: string }>>;
  accionEditar: (input: unknown) => Promise<Resultado<{ id: string }>>;
  accionBorrar: (input: unknown) => Promise<Resultado<{ id: string }>>;
  apiKey: string | undefined;
}

export function TablaParadas({ paradas, accionCrear, accionEditar, accionBorrar, apiKey }: Props) {
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [coordenadas, setCoordenadas] = useState<Coordenadas | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const [exitoBorrado, setExitoBorrado] = useState<string | null>(null);

  function abrirCrear() {
    setEditandoId(null);
    setNombre('');
    setDireccion('');
    setCoordenadas(null);
    setError(null);
    setDialogoAbierto(true);
  }

  function abrirEditar(parada: Parada) {
    setEditandoId(parada.id);
    setNombre(parada.nombre);
    setDireccion(parada.direccion);
    setCoordenadas({ lat: parada.lat, lng: parada.lng });
    setError(null);
    setDialogoAbierto(true);
  }

  function guardar() {
    setError(null);
    startTransition(async () => {
      const resultado = editandoId
        ? await accionEditar({
            id: editandoId,
            nombre,
            direccion,
            lat: coordenadas?.lat,
            lng: coordenadas?.lng,
          })
        : await accionCrear({
            nombre,
            direccion,
            lat: coordenadas?.lat,
            lng: coordenadas?.lng,
          });
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      setDialogoAbierto(false);
    });
  }

  function borrar(parada: Parada) {
    if (
      !confirm(`¿Borrar la parada "${parada.nombre}"? Deja de estar disponible para rutas nuevas.`)
    ) {
      return;
    }
    setErrorBorrado(null);
    setExitoBorrado(null);
    startTransition(async () => {
      const resultado = await accionBorrar(parada.id);
      if (!resultado.ok) {
        setErrorBorrado(resultado.error.mensaje);
        return;
      }
      setExitoBorrado(`Parada "${parada.nombre}" eliminada correctamente.`);
    });
  }

  const botonNuevo = (
    <Button type="button" onClick={abrirCrear}>
      Nueva parada
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{botonNuevo}</div>
      {errorBorrado ? <p className="text-sm text-destructive">{errorBorrado}</p> : null}
      {exitoBorrado ? <p className="text-sm text-success">{exitoBorrado}</p> : null}

      {paradas.length === 0 ? (
        <EstadoVacio titulo="Aun no hay paradas. Crea la primera" accion={botonNuevo} />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Direccion</TableHead>
                  <TableHead className="text-right">Coordenadas</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paradas.map((parada) => (
                  <TableRow key={parada.id}>
                    <TableCell>{parada.nombre}</TableCell>
                    <TableCell>{parada.direccion}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {parada.lat.toFixed(5)}, {parada.lng.toFixed(5)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => abrirEditar(parada)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pendiente}
                          onClick={() => borrar(parada)}
                        >
                          Borrar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-3 md:hidden">
            {paradas.map((parada) => (
              <li key={parada.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{parada.nombre}</p>
                    <p className="text-sm text-muted-foreground">{parada.direccion}</p>
                    <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                      {parada.lat.toFixed(5)}, {parada.lng.toFixed(5)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => abrirEditar(parada)}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pendiente}
                      onClick={() => borrar(parada)}
                    >
                      Borrar
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoId ? 'Editar parada' : 'Nueva parada'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="parada-nombre" className="text-sm font-medium">
                Nombre
              </label>
              <Input
                id="parada-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <SelectorParada
              apiKey={apiKey}
              direccion={direccion}
              coordenadas={coordenadas}
              onDireccionChange={setDireccion}
              onCoordenadasChange={setCoordenadas}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" onClick={guardar} disabled={pendiente}>
                {editandoId ? 'Guardar cambios' : 'Crear'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
