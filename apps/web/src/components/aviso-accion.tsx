/**
 * El aviso de que una mutacion se aplico (o no). Se repetia identico en las
 * cinco pantallas con borrado; vive aqui para que "se elimino" se vea igual en
 * todas y para tener un solo lugar donde ajustar su posicion.
 *
 * `sticky`: el area de contenido es lo unico que se desplaza en el marco del
 * panel, y una tabla de treinta renglones deja el encabezado fuera de vista. Sin
 * esto, el aviso de exito se pinta donde nadie lo esta viendo y la accion se
 * lee como que no hizo nada.
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
