import { borrarCliente, crearCliente, editarCliente, listarClientes } from '@/server/catalogos';
import { TablaClientes } from './tabla-clientes';

export const dynamic = 'force-dynamic';

export default async function PaginaClientes() {
  const clientes = await listarClientes();

  return (
    <TablaClientes
      titulo="Clientes"
      descripcion="Empresas a las que se les da servicio de transporte."
      clientes={clientes}
      accionCrear={crearCliente}
      accionEditar={editarCliente}
      accionBorrar={borrarCliente}
    />
  );
}
