import { borrarCliente, crearCliente, editarCliente, listarClientes } from '@/server/catalogos';
import { TablaClientes } from './tabla-clientes';

export const dynamic = 'force-dynamic';

export default async function PaginaClientes() {
  const clientes = await listarClientes();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Clientes</h1>
      <TablaClientes
        clientes={clientes}
        accionCrear={crearCliente}
        accionEditar={editarCliente}
        accionBorrar={borrarCliente}
      />
    </div>
  );
}
