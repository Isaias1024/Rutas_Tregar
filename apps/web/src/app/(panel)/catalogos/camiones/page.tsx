import { borrarCamion, crearCamion, editarCamion, listarCamiones } from '@/server/catalogos';
import { TablaCamiones } from './tabla-camiones';

export const dynamic = 'force-dynamic';

export default async function PaginaCamiones() {
  const camiones = await listarCamiones();

  return (
    <TablaCamiones
      titulo="Camiones"
      descripcion="Flota disponible para asignar a una ruta."
      camiones={camiones}
      accionCrear={crearCamion}
      accionEditar={editarCamion}
      accionBorrar={borrarCamion}
    />
  );
}
