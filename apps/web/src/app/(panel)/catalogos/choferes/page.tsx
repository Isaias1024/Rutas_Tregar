import { darDeBaja } from '@/server/baja';
import { borrarChofer, crearChofer, editarChofer, listarChoferes } from '@/server/catalogos';
import { TablaChoferes } from './tabla-choferes';

export const dynamic = 'force-dynamic';

export default async function PaginaChoferes() {
  const choferes = await listarChoferes();

  return (
    <TablaChoferes
      titulo="Choferes"
      descripcion="Personal que opera las rutas desde la app."
      choferes={choferes}
      accionCrear={crearChofer}
      accionEditar={editarChofer}
      accionBorrar={borrarChofer}
      accionDarDeBaja={darDeBaja}
    />
  );
}
