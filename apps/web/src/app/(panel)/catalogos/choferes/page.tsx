import { darDeBaja } from '@/server/baja';
import {
  borrarChofer,
  consultarRutasActivasDeChofer,
  crearChofer,
  editarChofer,
  listarChoferes,
} from '@/server/catalogos';
import { listarCamionesAsignables } from '@/server/choferes-nucleo';
import { TablaChoferes } from './tabla-choferes';

export const dynamic = 'force-dynamic';

export default async function PaginaChoferes() {
  const [choferes, camiones] = await Promise.all([listarChoferes(), listarCamionesAsignables()]);

  return (
    <TablaChoferes
      titulo="Choferes"
      descripcion="Personal que opera las rutas. Cada chofer trae su camion asignado."
      choferes={choferes}
      camiones={camiones}
      accionCrear={crearChofer}
      accionEditar={editarChofer}
      accionBorrar={borrarChofer}
      accionDarDeBaja={darDeBaja}
      accionConsultarRutas={consultarRutasActivasDeChofer}
    />
  );
}
