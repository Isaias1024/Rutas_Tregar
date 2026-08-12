'use client';

import { useEffect } from 'react';
import './globals.css';

export default function GlobalError({
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
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background p-4 antialiased">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 text-center sm:p-8">
          <h1 className="text-xl font-semibold text-foreground">Rutas no pudo cargar</h1>
          <p className="text-sm text-muted-foreground">
            Ocurrio un error inesperado. Intenta de nuevo; si el problema sigue, avisa al equipo de
            soporte.
          </p>
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-lg bg-primary px-2.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
