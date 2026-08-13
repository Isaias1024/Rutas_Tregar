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
import { AvisoAccion } from '@/components/aviso-accion';
import { EstadoVacio } from '@/components/estado-vacio';
import { EncabezadoPagina } from '@/components/shell/encabezado-pagina';
import { Card } from '@/components/ui/card';
import { DialogoConfirmar } from '@/components/ui/dialogo-confirmar';

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
  titulo: string;
  descripcion: string;
  choferes: Chofer[];
  accionCrear: (
    input: unknown,
  ) => Promise<Resultado<{ id: string; credencial: string; passwordTemporal: string }>>;
  accionEditar: (input: unknown) => Promise<Resultado<{ id: string }>>;
  accionBorrar: (input: unknown) => Promise<Resultado<{ id: string }>>;
  accionDarDeBaja: (input: unknown) => Promise<Resultado<{ id: string }>>;
}

export function TablaChoferes({
  titulo,
  descripcion,
  choferes,
  accionCrear,
  accionEditar,
  accionBorrar,
  accionDarDeBaja,
}: Props) {
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState<Chofer | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [credencialesNuevas, setCredencialesNuevas] = useState<CredencialesNuevas | null>(null);
  // Las dos acciones destructivas comparten un solo dialogo: `borrar` es la
  // baja logica del catalogo y `dar_de_baja` es la de la LFPDPPP, que ademas
  // borra los datos personales. Se distinguen aqui, no en dos estados sueltos.
  const [porConfirmar, setPorConfirmar] = useState<{
    chofer: Chofer;
    tipo: 'borrar' | 'baja';
  } | null>(null);
  const [errorBaja, setErrorBaja] = useState<string | null>(null);
  const [exitoBaja, setExitoBaja] = useState<string | null>(null);

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

  function pedirConfirmacion(chofer: Chofer, tipo: 'borrar' | 'baja') {
    setErrorBaja(null);
    setExitoBaja(null);
    setPorConfirmar({ chofer, tipo });
  }

  function confirmar() {
    if (!porConfirmar) {
      return;
    }
    const { chofer, tipo } = porConfirmar;
    const nombre = chofer.nombre ?? chofer.credencial;
    setErrorBaja(null);
    startTransition(async () => {
      const resultado =
        tipo === 'baja' ? await accionDarDeBaja(chofer.id) : await accionBorrar(chofer.id);
      if (!resultado.ok) {
        setErrorBaja(resultado.error.mensaje);
        return;
      }
      setPorConfirmar(null);
      setExitoBaja(
        tipo === 'baja'
          ? `Chofer "${nombre}" dado de baja correctamente.`
          : `Chofer "${nombre}" eliminado correctamente.`,
      );
    });
  }

  const botonNuevo = (
    <Button type="button" onClick={abrirCrear}>
      Nuevo chofer
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo={titulo} descripcion={descripcion} acciones={botonNuevo} />
      {/* El error de una baja se pinta dentro del dialogo, no aqui. */}
      <AvisoAccion exito={exitoBaja} />

      <DialogoConfirmar
        abierto={porConfirmar !== null}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setPorConfirmar(null);
          }
        }}
        titulo={porConfirmar?.tipo === 'baja' ? 'Dar de baja al chofer' : 'Borrar chofer'}
        descripcion={
          porConfirmar?.tipo === 'baja'
            ? `Se borran el nombre, el correo y el telefono de "${porConfirmar.chofer.nombre ?? porConfirmar.chofer.credencial}" de forma permanente (LFPDPPP) y se revoca su acceso. Sus rutas y eventos historicos se conservan. No se puede deshacer.`
            : `"${porConfirmar?.chofer.nombre ?? porConfirmar?.chofer.credencial ?? ''}" deja de aparecer en el catalogo y de poder asignarse. Sigue disponible en el historico.`
        }
        etiquetaConfirmar={porConfirmar?.tipo === 'baja' ? 'Dar de baja' : 'Borrar'}
        error={errorBaja}
        pendiente={pendiente}
        onConfirmar={confirmar}
      />

      {choferes.length === 0 ? (
        <Card>
          <EstadoVacio titulo="Aun no hay choferes. Crea el primero" accion={botonNuevo} />
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
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
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={pendiente}
                        onClick={() => pedirConfirmacion(chofer, 'borrar')}
                      >
                        Borrar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={pendiente}
                        onClick={() => pedirConfirmacion(chofer, 'baja')}
                      >
                        Dar de baja
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <ul className="flex flex-col gap-3 md:hidden">
            {choferes.map((chofer) => (
              <li
                key={chofer.id}
                className="rounded-lg border border-border bg-card p-4 shadow-tarjeta"
              >
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={pendiente}
                    onClick={() => pedirConfirmacion(chofer, 'borrar')}
                  >
                    Borrar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={pendiente}
                    onClick={() => pedirConfirmacion(chofer, 'baja')}
                  >
                    Dar de baja
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
          <dl className="space-y-2 rounded-lg border border-border bg-surface p-4 text-sm">
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
