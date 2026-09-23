'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type Resultado, type SupervisorCrear, supervisorCrearSchema } from '@rutas/shared';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { AvisoAccion } from '@/components/aviso-accion';
import { BotonCopiar } from '@/components/boton-copiar';
import { EstadoVacio } from '@/components/estado-vacio';
import { EncabezadoPagina } from '@/components/shell/encabezado-pagina';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DialogoConfirmar } from '@/components/ui/dialogo-confirmar';
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

interface Supervisor {
  id: string;
  credencial: string;
  correo: string | null;
  activo: boolean;
  nombre: string | null;
}

interface CredencialesNuevas {
  credencial: string;
  passwordTemporal: string;
}

interface Props {
  titulo: string;
  descripcion: string;
  supervisores: Supervisor[];
  esAdmin: boolean;
  accionCrear: (
    input: unknown,
  ) => Promise<Resultado<{ id: string; credencial: string; passwordTemporal: string }>>;
  accionDesactivar: (input: unknown) => Promise<Resultado<{ id: string }>>;
}

export function TablaSupervisores({
  titulo,
  descripcion,
  supervisores,
  esAdmin,
  accionCrear,
  accionDesactivar,
}: Props) {
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [porDesactivar, setPorDesactivar] = useState<Supervisor | null>(null);
  const [errorDesactivar, setErrorDesactivar] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [credencialesNuevas, setCredencialesNuevas] = useState<CredencialesNuevas | null>(null);

  const form = useForm<SupervisorCrear>({
    resolver: zodResolver(supervisorCrearSchema),
    defaultValues: { nombre: '', correo: '' },
  });

  function abrirCrear() {
    form.reset({ nombre: '', correo: '' });
    setError(null);
    setDialogoAbierto(true);
  }

  function guardar(valores: SupervisorCrear) {
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

  function pedirDesactivar(supervisor: Supervisor) {
    setErrorDesactivar(null);
    setExito(null);
    setPorDesactivar(supervisor);
  }

  function confirmarDesactivar() {
    const supervisor = porDesactivar;
    if (!supervisor) {
      return;
    }
    setErrorDesactivar(null);
    startTransition(async () => {
      const resultado = await accionDesactivar(supervisor.id);
      if (!resultado.ok) {
        setErrorDesactivar(resultado.error.mensaje);
        return;
      }
      setPorDesactivar(null);
      setExito(`Supervisor "${supervisor.nombre ?? supervisor.credencial}" desactivado.`);
    });
  }

  const botonNuevo = esAdmin ? (
    <Button type="button" onClick={abrirCrear}>
      Nuevo supervisor
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo={titulo} descripcion={descripcion} acciones={botonNuevo} />
      <AvisoAccion error={errorDesactivar} exito={exito} />

      <DialogoConfirmar
        abierto={porDesactivar !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setPorDesactivar(null);
        }}
        titulo="Desactivar supervisor"
        descripcion={`"${porDesactivar?.nombre ?? porDesactivar?.credencial ?? ''}" pierde acceso al panel de inmediato. Su historial de auditoria se conserva.`}
        etiquetaConfirmar="Desactivar"
        error={errorDesactivar}
        pendiente={pendiente}
        onConfirmar={confirmarDesactivar}
      />

      {supervisores.length === 0 ? (
        <Card>
          <EstadoVacio
            titulo={
              esAdmin ? 'Aun no hay supervisores. Crea el primero' : 'Aun no hay supervisores'
            }
            accion={botonNuevo}
          />
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Estado</TableHead>
                  {esAdmin ? <TableHead className="text-right">Acciones</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {supervisores.map((supervisor) => (
                  <TableRow key={supervisor.id}>
                    <TableCell>{supervisor.nombre ?? '—'}</TableCell>
                    <TableCell className="font-mono text-sm">{supervisor.correo ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={supervisor.activo ? 'default' : 'secondary'}>
                        {supervisor.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    {esAdmin ? (
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={pendiente || !supervisor.activo}
                          onClick={() => pedirDesactivar(supervisor)}
                        >
                          Desactivar
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <ul className="flex flex-col gap-3 md:hidden">
            {supervisores.map((supervisor) => (
              <li
                key={supervisor.id}
                className="rounded-lg border border-border bg-card p-4 shadow-tarjeta"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">
                    {supervisor.nombre ?? supervisor.credencial}
                  </p>
                  <Badge variant={supervisor.activo ? 'default' : 'secondary'}>
                    {supervisor.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{supervisor.correo ?? 'sin correo'}</p>
                {esAdmin ? (
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={pendiente || !supervisor.activo}
                      onClick={() => pedirDesactivar(supervisor)}
                    >
                      Desactivar
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Nuevo supervisor</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(guardar)} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="supervisor-nombre" className="text-sm font-medium">
                Nombre
              </label>
              <Input id="supervisor-nombre" {...form.register('nombre')} />
              {form.formState.errors.nombre ? (
                <p className="text-sm text-destructive">{form.formState.errors.nombre.message}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label htmlFor="supervisor-correo" className="text-sm font-medium">
                Correo corporativo
              </label>
              <Input id="supervisor-correo" type="email" {...form.register('correo')} />
              {form.formState.errors.correo ? (
                <p className="text-sm text-destructive">{form.formState.errors.correo.message}</p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Puede entrar con este correo por Google, o con la credencial y contraseña temporal
                que se muestran una sola vez al crearlo.
              </p>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={pendiente}>
                Crear
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={credencialesNuevas !== null} onOpenChange={() => setCredencialesNuevas(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supervisor creado</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Comparte estos datos con el supervisor ahora: no se van a volver a mostrar. Va a tener
            que cambiar la contraseña en su primer ingreso. Tambien puede entrar con su cuenta de
            Google, con el correo que capturaste.
          </p>
          <dl className="space-y-2 rounded-lg border border-border bg-surface p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium">Credencial</dt>
              <dd className="flex items-center gap-1">
                <span className="font-mono">{credencialesNuevas?.credencial}</span>
                <BotonCopiar valor={credencialesNuevas?.credencial ?? ''} etiqueta="Credencial" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-medium">Contraseña temporal</dt>
              <dd className="flex items-center gap-1">
                <span className="font-mono">{credencialesNuevas?.passwordTemporal}</span>
                <BotonCopiar
                  valor={credencialesNuevas?.passwordTemporal ?? ''}
                  etiqueta="Contraseña temporal"
                />
              </dd>
            </div>
          </dl>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void navigator.clipboard?.writeText(
                  `Credencial: ${credencialesNuevas?.credencial}\nContraseña temporal: ${credencialesNuevas?.passwordTemporal}`,
                )
              }
            >
              Copiar los dos
            </Button>
            <Button type="button" onClick={() => setCredencialesNuevas(null)}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
