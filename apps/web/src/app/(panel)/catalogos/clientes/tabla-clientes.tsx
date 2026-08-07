'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ClienteCrear,
  type ClienteEditar,
  clienteCrearSchema,
  clienteEditarSchema,
  type Resultado,
} from '@rutas/shared';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EstadoVacio } from '@/components/estado-vacio';

interface Cliente {
  id: string;
  nombre: string;
  activo: boolean;
  deletedAt: Date | null;
  createdAt: Date;
}

interface Props {
  clientes: Cliente[];
  accionCrear: (input: unknown) => Promise<Resultado<{ id: string }>>;
  accionEditar: (input: unknown) => Promise<Resultado<{ id: string }>>;
  accionBorrar: (input: unknown) => Promise<Resultado<{ id: string }>>;
}

export function TablaClientes({ clientes, accionCrear, accionEditar, accionBorrar }: Props) {
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const formCrear = useForm<ClienteCrear>({
    resolver: zodResolver(clienteCrearSchema),
    defaultValues: { nombre: '' },
  });
  const formEditar = useForm<ClienteEditar>({ resolver: zodResolver(clienteEditarSchema) });

  function abrirCrear() {
    setEditando(null);
    formCrear.reset({ nombre: '' });
    setError(null);
    setDialogoAbierto(true);
  }

  function abrirEditar(cliente: Cliente) {
    setEditando(cliente);
    formEditar.reset({ id: cliente.id, nombre: cliente.nombre, activo: cliente.activo });
    setError(null);
    setDialogoAbierto(true);
  }

  function guardarCrear(valores: ClienteCrear) {
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

  function guardarEditar(valores: ClienteEditar) {
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

  function borrar(cliente: Cliente) {
    if (!confirm(`¿Borrar a "${cliente.nombre}"? Sigue disponible en el historico.`)) {
      return;
    }
    startTransition(async () => {
      await accionBorrar(cliente.id);
    });
  }

  const botonNuevo = (
    <Button type="button" onClick={abrirCrear}>
      Nuevo cliente
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{botonNuevo}</div>

      {clientes.length === 0 ? (
        <EstadoVacio titulo="Aun no hay clientes. Crea el primero" accion={botonNuevo} />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.map((cliente) => (
                  <TableRow key={cliente.id}>
                    <TableCell>{cliente.nombre}</TableCell>
                    <TableCell>
                      <Badge variant={cliente.activo ? 'default' : 'secondary'}>
                        {cliente.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => abrirEditar(cliente)}
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => borrar(cliente)}
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
            {clientes.map((cliente) => (
              <li key={cliente.id} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">{cliente.nombre}</p>
                  <Badge variant={cliente.activo ? 'default' : 'secondary'}>
                    {cliente.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => abrirEditar(cliente)}
                  >
                    Editar
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => borrar(cliente)}>
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
            <DialogTitle>{editando ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
          </DialogHeader>
          {editando ? (
            <form onSubmit={formEditar.handleSubmit(guardarEditar)} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="cliente-nombre-editar" className="text-sm font-medium">
                  Nombre
                </label>
                <Input id="cliente-nombre-editar" {...formEditar.register('nombre')} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...formEditar.register('activo')} />
                Activo
              </label>
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
                <label htmlFor="cliente-nombre-crear" className="text-sm font-medium">
                  Nombre
                </label>
                <Input id="cliente-nombre-crear" {...formCrear.register('nombre')} />
                {formCrear.formState.errors.nombre ? (
                  <p className="text-sm text-destructive">
                    {formCrear.formState.errors.nombre.message}
                  </p>
                ) : null}
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
