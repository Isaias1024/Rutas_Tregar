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
 * La confirmacion de TODA accion destructiva: tras "impedir que esta pagina cree
 * mas dialogos", un `confirm()` nativo devuelve `false` sin mostrarse.
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
   * Lo que la accion arrastra consigo, cuando hace falta enumerarlo. Va aparte
   * de `descripcion` porque `DialogDescription` no admite bloques.
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
