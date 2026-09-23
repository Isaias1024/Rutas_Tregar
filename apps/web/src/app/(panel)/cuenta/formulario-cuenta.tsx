'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type CambiarPassword, cambiarPasswordSchema, type Resultado } from '@rutas/shared';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { AvisoAccion } from '@/components/aviso-accion';
import { EncabezadoPagina } from '@/components/shell/encabezado-pagina';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PasswordInput } from '@/components/ui/password-input';

const ETIQUETAS_ROL: Record<'admin' | 'supervisor' | 'chofer', string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  chofer: 'Chofer',
};

interface Props {
  correo: string | null;
  credencial: string;
  rol: 'admin' | 'supervisor' | 'chofer';
  debeCambiarPassword: boolean;
  accionCambiarPassword: (input: unknown) => Promise<Resultado<{ id: string }>>;
}

export function FormularioCuenta({
  correo,
  credencial,
  rol,
  debeCambiarPassword,
  accionCambiarPassword,
}: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const form = useForm<CambiarPassword>({
    resolver: zodResolver(cambiarPasswordSchema),
    defaultValues: { nueva: '', confirmacion: '' },
  });

  function guardar(valores: CambiarPassword) {
    startTransition(async () => {
      const resultado = await accionCambiarPassword(valores);
      if (!resultado.ok) {
        form.setError('confirmacion', { message: resultado.error.mensaje });
        return;
      }
      // Con la compuerta ya apagada, el proxy deja pasar la siguiente
      // navegacion sin rebotar de vuelta a /cuenta.
      router.push(rol === 'admin' ? '/planeador' : '/monitor');
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Mi cuenta"
        descripcion={
          debeCambiarPassword
            ? 'Tienes que elegir una contraseña nueva antes de continuar.'
            : 'Tu identidad en el panel y tu contraseña de acceso.'
        }
      />

      {debeCambiarPassword ? (
        <AvisoAccion exito="Es tu primer ingreso con esta cuenta: elige una contraseña nueva para continuar." />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Identidad</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Correo</dt>
              <dd className="font-mono">{correo ?? '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Credencial</dt>
              <dd className="font-mono">{credencial}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Rol</dt>
              <dd>{ETIQUETAS_ROL[rol]}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(guardar)} className="max-w-sm space-y-4">
            <div className="space-y-1">
              <label htmlFor="cuenta-password-nueva" className="text-sm font-medium">
                Contraseña nueva
              </label>
              <PasswordInput id="cuenta-password-nueva" {...form.register('nueva')} />
              {form.formState.errors.nueva ? (
                <p className="text-sm text-destructive">{form.formState.errors.nueva.message}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label htmlFor="cuenta-password-confirmacion" className="text-sm font-medium">
                Confirma la contraseña
              </label>
              <PasswordInput id="cuenta-password-confirmacion" {...form.register('confirmacion')} />
              {form.formState.errors.confirmacion ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.confirmacion.message}
                </p>
              ) : null}
            </div>
            <Button type="submit" disabled={pendiente}>
              Guardar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
