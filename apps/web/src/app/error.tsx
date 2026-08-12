'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 text-center sm:p-8">
        <h1 className="text-xl font-semibold text-foreground">Algo salio mal</h1>
        <p className="text-sm text-muted-foreground">
          No pudimos cargar esta pantalla. Intenta de nuevo; si el problema sigue, avisa al equipo
          de soporte.
        </p>
        <Button type="button" onClick={reset} className="w-full">
          Reintentar
        </Button>
      </div>
    </main>
  );
}
