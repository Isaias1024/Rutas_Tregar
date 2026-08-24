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
import { AvisoAccion } from '@/components/aviso-accion';
import { EstadoVacio } from '@/components/estado-vacio';
import { type Coordenadas, SelectorParada } from '@/components/mapa/selector-parada';
import { EncabezadoPagina } from '@/components/shell/encabezado-pagina';
import { Card } from '@/components/ui/card';
import { DialogoConfirmar } from '@/components/ui/dialogo-confirmar';

interface Parada {
  id: string;
  nombre: string;
  direccion: string;
  lat: number;
  lng: number;
}

interface RutaQueUsa {
  id: string;
  nombre: string;
}

interface Props {
  titulo: string;
  descripcion: string;
  paradas: Parada[];
  accionCrear: (input: unknown) => Promise<Resultado<{ id: string }>>;
  accionEditar: (input: unknown) => Promise<Resultado<{ id: string }>>;
  accionBorrar: (input: unknown) => Promise<Resultado<{ id: string }>>;
  accionConsultarRutas: (input: unknown) => Promise<Resultado<RutaQueUsa[]>>;
  apiKey: string | undefined;
}

export function TablaParadas({
  titulo,
  descripcion,
  paradas,
  accionCrear,
  accionEditar,
  accionBorrar,
  accionConsultarRutas,
  apiKey,
}: Props) {
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [coordenadas, setCoordenadas] = useState<Coordenadas | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [porBorrar, setPorBorrar] = useState<Parada | null>(null);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const [exitoBorrado, setExitoBorrado] = useState<string | null>(null);
  const [rutasAfectadas, setRutasAfectadas] = useState<RutaQueUsa[] | null>(null);

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

  function aplicarGuardado() {
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
        setRutasAfectadas(null);
        return;
      }
      setRutasAfectadas(null);
      setDialogoAbierto(false);
    });
  }

  /**
   * Editar una parada cambia la direccion y las coordenadas de TODAS las rutas
   * que la usan de golpe — las rutas la referencian, no guardan copia. Por eso
   * el guardado de una edicion pasa antes por una confirmacion que enumera esas
   * rutas; crear una parada nueva no afecta a nadie y guarda directo.
   */
  function guardar() {
    setError(null);
    if (!editandoId) {
      aplicarGuardado();
      return;
    }
    startTransition(async () => {
      const consulta = await accionConsultarRutas(editandoId);
      if (!consulta.ok) {
        setError(consulta.error.mensaje);
        return;
      }
      if (consulta.data.length === 0) {
        aplicarGuardado();
        return;
      }
      setRutasAfectadas(consulta.data);
    });
  }

  function pedirBorrado(parada: Parada) {
    setErrorBorrado(null);
    setExitoBorrado(null);
    setPorBorrar(parada);
  }

  function confirmarBorrado() {
    const parada = porBorrar;
    if (!parada) {
      return;
    }
    setErrorBorrado(null);
    startTransition(async () => {
      const resultado = await accionBorrar(parada.id);
      if (!resultado.ok) {
        setErrorBorrado(resultado.error.mensaje);
        return;
      }
      setPorBorrar(null);
      setExitoBorrado(`Parada "${parada.nombre}" eliminada correctamente.`);
    });
  }

  const botonNuevo = (
    <Button type="button" onClick={abrirCrear}>
      Nueva parada
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo={titulo} descripcion={descripcion} acciones={botonNuevo} />
      {/* El error de un borrado se pinta dentro del dialogo, no aqui. */}
      <AvisoAccion exito={exitoBorrado} />

      <DialogoConfirmar
        abierto={porBorrar !== null}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setPorBorrar(null);
          }
        }}
        titulo="Borrar parada"
        descripcion={`La parada "${porBorrar?.nombre ?? ''}" deja de estar disponible para rutas nuevas. Si alguna ruta la usa hoy, el borrado se rechaza y te decimos cuales.`}
        etiquetaConfirmar="Borrar"
        error={errorBorrado}
        pendiente={pendiente}
        onConfirmar={confirmarBorrado}
      />

      {/* Editar una parada en uso cambia todas sus rutas a la vez: se enumera
          antes de aplicar, y quien confirma sabe exactamente que toca. */}
      <DialogoConfirmar
        abierto={rutasAfectadas !== null}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setRutasAfectadas(null);
          }
        }}
        titulo="Esta parada esta en uso"
        descripcion={`Si modificas "${nombre}", el cambio afecta a todas las rutas que la utilizan. Las rutas no guardan una copia: toman la direccion y las coordenadas de esta parada.`}
        detalle={
          <ul className="space-y-1 rounded-lg border border-warning/30 bg-warning/5 p-3">
            {(rutasAfectadas ?? []).map((ruta) => (
              <li key={ruta.id} className="text-sm text-foreground">
                {ruta.nombre}
              </li>
            ))}
          </ul>
        }
        etiquetaConfirmar="Modificar de todas formas"
        error={error}
        pendiente={pendiente}
        onConfirmar={aplicarGuardado}
      />

      {paradas.length === 0 ? (
        <Card>
          <EstadoVacio titulo="Aun no hay paradas. Crea la primera" accion={botonNuevo} />
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Direccion</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paradas.map((parada) => (
                  <TableRow key={parada.id}>
                    <TableCell>{parada.nombre}</TableCell>
                    <TableCell>{parada.direccion}</TableCell>
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
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={pendiente}
                          onClick={() => pedirBorrado(parada)}
                        >
                          Borrar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <ul className="flex flex-col gap-3 md:hidden">
            {paradas.map((parada) => (
              <li
                key={parada.id}
                className="rounded-lg border border-border bg-card p-4 shadow-tarjeta"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{parada.nombre}</p>
                    <p className="text-sm text-muted-foreground">{parada.direccion}</p>
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
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={pendiente}
                      onClick={() => pedirBorrado(parada)}
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
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
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
