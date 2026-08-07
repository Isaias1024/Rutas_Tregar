import { listarActoresParaFiltro } from '@/server/bitacora';
import { BitacoraCliente } from './bitacora-cliente';

export const dynamic = 'force-dynamic';

export default async function PaginaBitacora() {
  const actores = await listarActoresParaFiltro();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Bitacora</h1>
      <BitacoraCliente actores={actores} />
    </div>
  );
}
