'use client';

import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  /** Lo que se copia al portapapeles. */
  valor: string;
  /** Para el lector de pantalla y el `aria-label` del boton. */
  etiqueta: string;
  className?: string;
}

/**
 * Boton de icono que copia `valor` al portapapeles y confirma con un check
 * durante 1.5s. Pensado para credenciales y contrasenas temporales: texto
 * que se comparte tal cual con alguien mas y que un typo al transcribirlo a
 * mano rompe silenciosamente (una credencial que no entra no dice por que).
 */
export function BotonCopiar({ valor, etiqueta, className }: Props) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    // El portapapeles solo existe en contexto seguro (https o localhost); si
    // no esta disponible, no rompemos el boton, simplemente no confirmamos.
    if (!navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(valor);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn('shrink-0', className)}
      onClick={() => void copiar()}
      aria-label={copiado ? `${etiqueta} copiado` : `Copiar ${etiqueta.toLowerCase()}`}
    >
      {copiado ? (
        <CheckIcon aria-hidden="true" className="text-success" />
      ) : (
        <CopyIcon aria-hidden="true" />
      )}
    </Button>
  );
}
