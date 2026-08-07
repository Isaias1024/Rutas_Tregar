'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CamionCrear,
  type CamionEditar,
  camionCrearSchema,
  camionEditarSchema,
  ESTADOS_CAMION,
  type Resultado,
} from '@rutas/shared';
import { useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
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
import { EstadoVacio } from '@/components/estado-vacio';

interface Camion {
  id: string;
  codigo: string;
  tipo: string;
  placas: string;
  km: number;
  estado: (typeof ESTADOS_CAMION)[number];
  deletedAt: Date | null;
}

interface Props {
  camiones: Camion[];
  accionCrear: (input: unknown) => Promise<Resultado<{ id: string }>>;
  accionEditar: (input: unknown) => Promise<Resultado<{ id: string }>>;
  accionBorrar: (input: unknown) => Promise<Resultado<{ id: string }>>;
}

const ETIQUETA_ESTADO: Record<(typeof ESTADOS_CAMION)[number], string> = {
  disponible: 'Disponible',
  asignado: 'Asignado',
  mantenimiento: 'Mantenimiento',
};

function BadgeEstado({ estado }: { estado: (typeof ESTADOS_CAMION)[number] }) {
  const variante =
    estado === 'mantenimiento' ? 'destructive' : estado === 'asignado' ? 'secondary' : 'default';
  return <Badge variant={variante}>{ETIQUETA_ESTADO[estado]}</Badge>;
}

export function TablaCamiones({ camiones, accionCrear, accionEditar, accionBorrar }: Props) {
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState<Camion | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const formCrear = useForm<CamionCrear>({
    resolver: zodResolver(camionCrearSchema),
    defaultValues: { codigo: '', tipo: '', placas: '', km: 0, estado: 'disponible' },
  });
  const formEditar = useForm<CamionEditar>({ resolver: zodResolver(camionEditarSchema) });

  function abrirCrear() {
    setEditando(null);
    formCrear.reset({ codigo: '', tipo: '', placas: '', km: 0, estado: 'disponible' });
    setError(null);
    setDialogoAbierto(true);
  }

  function abrirEditar(camion: Camion) {
    setEditando(camion);
    formEditar.reset({
      id: camion.id,
      codigo: camion.codigo,
      tipo: camion.tipo,
      placas: camion.placas,
      km: camion.km,
      estado: camion.estado,
    });
    setError(null);
    setDialogoAbierto(true);
  }

  function guardarCrear(valores: CamionCrear) {
    setError(null);
    startTransition(async () => {
      const resultado = await accionCrear(valores);
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      setDialogoAbierto(false);
    });
  }

  function guardarEditar(valores: CamionEditar) {
    setError(null);
    startTransition(async () => {
      const resultado = await accionEditar(valores);
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      setDialogoAbierto(false);
    });
  }

  function borrar(camion: Camion) {
    if (!confirm(`¿Borrar el camion "${camion.codigo}"? Sigue disponible en el historico.`)) {
      return;
    }
    startTransition(async () => {
      await accionBorrar(camion.id);
    });
  }

  const botonNuevo = (
    <Button type="button" onClick={abrirCrear}>
      Nuevo camion
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{botonNuevo}</div>

      {camiones.length === 0 ? (
        <EstadoVacio titulo="Aun no hay camiones. Crea el primero" accion={botonNuevo} />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codigo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Placas</TableHead>
                  <TableHead>Km</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {camiones.map((camion) => (
                  <TableRow key={camion.id}>
                    <TableCell className="font-medium">{camion.codigo}</TableCell>
                    <TableCell>{camion.tipo}</TableCell>
                    <TableCell>{camion.placas}</TableCell>
                    <TableCell className="tabular-nums">{camion.km}</TableCell>
                    <TableCell>
                      <BadgeEstado estado={camion.estado} />
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => abrirEditar(camion)}
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => borrar(camion)}
                      >
                        Borrar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-3 md:hidden">
            {camiones.map((camion) => (
              <li key={camion.id} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">{camion.codigo}</p>
                  <BadgeEstado estado={camion.estado} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {camion.tipo} · {camion.placas} · {camion.km} km
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => abrirEditar(camion)}
                  >
                    Editar
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => borrar(camion)}>
                    Borrar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar camion' : 'Nuevo camion'}</DialogTitle>
          </DialogHeader>
          {editando ? (
            <form onSubmit={formEditar.handleSubmit(guardarEditar)} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="camion-codigo-editar" className="text-sm font-medium">
                  Codigo
                </label>
                <Input id="camion-codigo-editar" {...formEditar.register('codigo')} />
              </div>
              <div className="space-y-1">
                <label htmlFor="camion-tipo-editar" className="text-sm font-medium">
                  Tipo
                </label>
                <Input
                  id="camion-tipo-editar"
                  placeholder="Van, Autobus, Urban"
                  {...formEditar.register('tipo')}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="camion-placas-editar" className="text-sm font-medium">
                  Placas
                </label>
                <Input id="camion-placas-editar" {...formEditar.register('placas')} />
              </div>
              <div className="space-y-1">
                <label htmlFor="camion-km-editar" className="text-sm font-medium">
                  Kilometraje
                </label>
                <Input
                  id="camion-km-editar"
                  type="number"
                  min={0}
                  {...formEditar.register('km', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1">
                <span className="text-sm font-medium">Estado</span>
                <Controller
                  control={formEditar.control}
                  name="estado"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ESTADOS_CAMION.map((estado) => (
                          <SelectItem key={estado} value={estado}>
                            {ETIQUETA_ESTADO[estado]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button type="submit" disabled={pendiente}>
                  Guardar
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <form onSubmit={formCrear.handleSubmit(guardarCrear)} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="camion-codigo-crear" className="text-sm font-medium">
                  Codigo
                </label>
                <Input id="camion-codigo-crear" {...formCrear.register('codigo')} />
              </div>
              <div className="space-y-1">
                <label htmlFor="camion-tipo-crear" className="text-sm font-medium">
                  Tipo
                </label>
                <Input
                  id="camion-tipo-crear"
                  placeholder="Van, Autobus, Urban"
                  {...formCrear.register('tipo')}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="camion-placas-crear" className="text-sm font-medium">
                  Placas
                </label>
                <Input id="camion-placas-crear" {...formCrear.register('placas')} />
              </div>
              <div className="space-y-1">
                <label htmlFor="camion-km-crear" className="text-sm font-medium">
                  Kilometraje
                </label>
                <Input
                  id="camion-km-crear"
                  type="number"
                  min={0}
                  {...formCrear.register('km', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1">
                <span className="text-sm font-medium">Estado</span>
                <Controller
                  control={formCrear.control}
                  name="estado"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ESTADOS_CAMION.map((estado) => (
                          <SelectItem key={estado} value={estado}>
                            {ETIQUETA_ESTADO[estado]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button type="submit" disabled={pendiente}>
                  Crear
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
