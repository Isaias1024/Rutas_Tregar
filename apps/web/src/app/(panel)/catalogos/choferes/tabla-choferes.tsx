'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ChoferCrear,
  type ChoferEditar,
  choferCrearSchema,
  choferEditarSchema,
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

interface Chofer {
  id: string;
  credencial: string;
  activo: boolean;
  camionId: string | null;
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
}

interface CredencialesNuevas {
  credencial: string;
  passwordTemporal: string;
}

interface Props {
  choferes: Chofer[];
  accionCrear: (
    input: unknown,
  ) => Promise<Resultado<{ id: string; credencial: string; passwordTemporal: string }>>;
  accionEditar: (input: unknown) => Promise<Resultado<{ id: string }>>;
  accionBorrar: (input: unknown) => Promise<Resultado<{ id: string }>>;
}

export function TablaChoferes({ choferes, accionCrear, accionEditar, accionBorrar }: Props) {
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState<Chofer | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [credencialesNuevas, setCredencialesNuevas] = useState<CredencialesNuevas | null>(null);

  const formCrear = useForm<ChoferCrear>({
    resolver: zodResolver(choferCrearSchema),
    defaultValues: { nombre: '', correo: '', telefono: '' },
  });
  const formEditar = useForm<ChoferEditar>({ resolver: zodResolver(choferEditarSchema) });

  function abrirCrear() {
    setEditando(null);
    formCrear.reset({ nombre: '', correo: '', telefono: '' });
    setError(null);
    setDialogoAbierto(true);
  }

  function abrirEditar(chofer: Chofer) {
    setEditando(chofer);
    formEditar.reset({
      id: chofer.id,
      nombre: chofer.nombre ?? '',
      correo: chofer.correo ?? '',
      telefono: chofer.telefono ?? '',
      activo: chofer.activo,
    });
    setError(null);
    setDialogoAbierto(true);
  }

  function guardarCrear(valores: ChoferCrear) {
    setError(null);
    startTransition(async () => {
      const resultado = await accionCrear(valores);
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      setDialogoAbierto(false);
      setCredencialesNuevas({
        credencial: resultado.data.credencial,
        passwordTemporal: resultado.data.passwordTemporal,
      });
    });
  }

  function guardarEditar(valores: ChoferEditar) {
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

  function borrar(chofer: Chofer) {
    if (
      !confirm(
        `¿Borrar a "${chofer.nombre ?? chofer.credencial}"? Sigue disponible en el historico.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      await accionBorrar(chofer.id);
    });
  }

  const botonNuevo = (
    <Button type="button" onClick={abrirCrear}>
      Nuevo chofer
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{botonNuevo}</div>

      {choferes.length === 0 ? (
        <EstadoVacio titulo="Aun no hay choferes. Crea el primero" accion={botonNuevo} />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Credencial</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {choferes.map((chofer) => (
                  <TableRow key={chofer.id}>
                    <TableCell>{chofer.nombre ?? '—'}</TableCell>
                    <TableCell className="font-mono text-sm">{chofer.credencial}</TableCell>
                    <TableCell>{chofer.telefono ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={chofer.activo ? 'default' : 'secondary'}>
                        {chofer.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => abrirEditar(chofer)}
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => borrar(chofer)}
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
            {choferes.map((chofer) => (
              <li key={chofer.id} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">
                    {chofer.nombre ?? chofer.credencial}
                  </p>
                  <Badge variant={chofer.activo ? 'default' : 'secondary'}>
                    {chofer.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {chofer.credencial} · {chofer.telefono ?? 'sin telefono'}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => abrirEditar(chofer)}
                  >
                    Editar
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => borrar(chofer)}>
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
            <DialogTitle>{editando ? 'Editar chofer' : 'Nuevo chofer'}</DialogTitle>
          </DialogHeader>
          {editando ? (
            <form onSubmit={formEditar.handleSubmit(guardarEditar)} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="chofer-nombre-editar" className="text-sm font-medium">
                  Nombre
                </label>
                <Input id="chofer-nombre-editar" {...formEditar.register('nombre')} />
              </div>
              <div className="space-y-1">
                <label htmlFor="chofer-correo-editar" className="text-sm font-medium">
                  Correo (opcional)
                </label>
                <Input id="chofer-correo-editar" type="email" {...formEditar.register('correo')} />
              </div>
              <div className="space-y-1">
                <label htmlFor="chofer-telefono-editar" className="text-sm font-medium">
                  Telefono (opcional)
                </label>
                <Input id="chofer-telefono-editar" {...formEditar.register('telefono')} />
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
                <label htmlFor="chofer-nombre-crear" className="text-sm font-medium">
                  Nombre
                </label>
                <Input id="chofer-nombre-crear" {...formCrear.register('nombre')} />
                {formCrear.formState.errors.nombre ? (
                  <p className="text-sm text-destructive">
                    {formCrear.formState.errors.nombre.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <label htmlFor="chofer-correo-crear" className="text-sm font-medium">
                  Correo (opcional)
                </label>
                <Input id="chofer-correo-crear" type="email" {...formCrear.register('correo')} />
              </div>
              <div className="space-y-1">
                <label htmlFor="chofer-telefono-crear" className="text-sm font-medium">
                  Telefono (opcional)
                </label>
                <Input id="chofer-telefono-crear" {...formCrear.register('telefono')} />
              </div>
              <p className="text-sm text-muted-foreground">
                La credencial y la contrasena temporal se generan solas y se muestran una sola vez
                al terminar.
              </p>
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

      <Dialog open={credencialesNuevas !== null} onOpenChange={() => setCredencialesNuevas(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chofer creado</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Comparte estos datos con el chofer ahora: no se van a volver a mostrar. Va a tener que
            cambiar la contrasena en su primer ingreso.
          </p>
          <dl className="space-y-2 rounded-lg border border-border p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="font-medium">Credencial</dt>
              <dd className="font-mono">{credencialesNuevas?.credencial}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-medium">Contrasena temporal</dt>
              <dd className="font-mono">{credencialesNuevas?.passwordTemporal}</dd>
            </div>
          </dl>
          <DialogFooter>
            <Button type="button" onClick={() => setCredencialesNuevas(null)}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
