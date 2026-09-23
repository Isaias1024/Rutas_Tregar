/**
 * El aviso de que una mutacion se aplico, compartido por las pantallas con
 * borrado. `sticky` porque en una tabla larga quedaria fuera de vista.
 */
export function AvisoAccion({ error, exito }: { error?: string | null; exito?: string | null }) {
  if (!error && !exito) {
    return null;
  }

  return error ? (
    <p
      role="alert"
      className="sticky top-0 z-20 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive shadow-tarjeta"
    >
      {error}
    </p>
  ) : (
    <p
      role="status"
      className="sticky top-0 z-20 rounded-md border border-primary/30 bg-primary-tint p-3 text-sm text-primary shadow-tarjeta"
    >
      {exito}
    </p>
  );
}
