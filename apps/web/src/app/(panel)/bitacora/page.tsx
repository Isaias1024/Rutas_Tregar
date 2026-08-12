import { listarActoresParaFiltro } from '@/server/bitacora';
import { BitacoraCliente } from './bitacora-cliente';
import { EncabezadoPagina } from '@/components/shell/encabezado-pagina';

export const dynamic = 'force-dynamic';

export default async function PaginaBitacora() {
  const actores = await listarActoresParaFiltro();

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Bitacora"
        descripcion="Registro de toda mutacion administrativa del panel."
      />
      <BitacoraCliente actores={actores} />
    </div>
  );
}
