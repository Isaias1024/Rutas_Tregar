import { borrarCamion, crearCamion, editarCamion, listarCamiones } from '@/server/catalogos';
import { TablaCamiones } from './tabla-camiones';

export const dynamic = 'force-dynamic';

export default async function PaginaCamiones() {
  const camiones = await listarCamiones();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Camiones</h1>
      <TablaCamiones
        camiones={camiones}
        accionCrear={crearCamion}
        accionEditar={editarCamion}
        accionBorrar={borrarCamion}
      />
    </div>
  );
}
