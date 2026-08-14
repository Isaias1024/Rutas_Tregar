'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * La confirmacion de TODA accion destructiva del panel.
 *
 * Existe porque el `confirm()` nativo del navegador no sirve para esto: cuando
 * una pagina abre varios seguidos, Chrome ofrece "impedir que esta pagina cree
 * mas dialogos" y a partir de ahi **devuelve `false` sin mostrar nada** durante
 * toda la vida de la pestana. El panel es una SPA que no recarga, asi que la
 * supresion no se cae sola: cada Borrar y cada Cancelar quedaban en un no-op
 * silencioso — sin borrar, sin fila en `audit_log` y sin un solo mensaje en
 * pantalla — mientras Crear y Editar seguian funcionando porque no pasan por
 * ningun `confirm()`. Un dialogo propio no se puede suprimir.
 *
 * El rojo pleno vive aqui y solo aqui: la accion destructiva de una fila es
 * `ghost` con `text-destructive`, y el boton que confirma dentro del dialogo es
 * el unico `destructive` relleno.
 */
export function DialogoConfirmar({
  abierto,
  onOpenChange,
  titulo,
  descripcion,
  detalle,
  etiquetaConfirmar,
  etiquetaVolver = 'Cancelar',
  error,
  pendiente = false,
  onConfirmar,
}: {
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  titulo: string;
  descripcion: string;
  /**
   * Lo que la accion va a arrastrar consigo, cuando hace falta enumerarlo: las
   * rutas que pierde un chofer al darlo de baja, las rutas que usan una parada.
   * `descripcion` es texto plano a proposito (va en un `DialogDescription`, que
   * no admite bloques), asi que una lista se pasa por aqui.
   */
  detalle?: ReactNode;
  etiquetaConfirmar: string;
  /** El planeador lo cambia a "Volver": ahi la accion destructiva ya se llama "Cancelar". */
  etiquetaVolver?: string;
  /** El error se pinta DENTRO del dialogo, que es donde esta mirando quien confirmo. */
  error?: string | null;
  pendiente?: boolean;
  onConfirmar: () => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        {detalle}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pendiente}
            onClick={() => onOpenChange(false)}
          >
            {etiquetaVolver}
          </Button>
          <Button type="button" variant="destructive" disabled={pendiente} onClick={onConfirmar}>
            {pendiente ? 'Aplicando…' : etiquetaConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
