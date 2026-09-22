import { crearSupervisor, desactivarSupervisor, listarSupervisores } from '@/server/catalogos';
import { obtenerUsuarioActual } from '@/server/sesion';
import { TablaSupervisores } from './tabla-supervisores';

export const dynamic = 'force-dynamic';

export default async function PaginaSupervisores() {
  const [supervisores, actor] = await Promise.all([listarSupervisores(), obtenerUsuarioActual()]);

  return (
    <TablaSupervisores
      titulo="Supervisores"
      descripcion="Quien mas administra el panel. Entran con su cuenta de Google corporativa o con credencial y contrasena."
      supervisores={supervisores}
      // Solo para no ofrecer botones que el servidor va a rechazar: la regla real
      // la imponen `crearSupervisor`/`desactivarSupervisor`.
      esAdmin={actor?.rol === 'admin'}
      accionCrear={crearSupervisor}
      accionDesactivar={desactivarSupervisor}
    />
  );
}
