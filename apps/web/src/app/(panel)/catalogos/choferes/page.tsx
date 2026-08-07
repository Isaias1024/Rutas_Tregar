import { borrarChofer, crearChofer, editarChofer, listarChoferes } from '@/server/catalogos';
import { darDeBaja } from '@/server/baja';
import { TablaChoferes } from './tabla-choferes';

export const dynamic = 'force-dynamic';

export default async function PaginaChoferes() {
  const choferes = await listarChoferes();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Choferes</h1>
      <TablaChoferes
        choferes={choferes}
        accionCrear={crearChofer}
        accionEditar={editarChofer}
        accionBorrar={borrarChofer}
        accionDarDeBaja={darDeBaja}
      />
    </div>
  );
}
