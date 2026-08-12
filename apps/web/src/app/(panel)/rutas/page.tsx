import { env } from '@/lib/env';
import { listarClientes } from '@/server/catalogos';
import { crearParada, listarParadas } from '@/server/paradas';
import {
  actualizarRuta,
  agregarHorario,
  borrarRuta,
  crearRuta,
  desactivarHorario,
  listarRutas,
} from '@/server/rutas';
import { TablaRutas } from './tabla-rutas';

export const dynamic = 'force-dynamic';

export default async function PaginaRutas() {
  const [rutas, clientes, paradas] = await Promise.all([
    listarRutas(),
    listarClientes(),
    listarParadas(),
  ]);

  return (
    <TablaRutas
      titulo="Rutas"
      descripcion="Recorridos y sus horarios por turno."
      rutas={rutas}
      clientes={clientes}
      paradas={paradas}
      apiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
      accionCrearRuta={crearRuta}
      accionActualizarRuta={actualizarRuta}
      accionBorrarRuta={borrarRuta}
      accionAgregarHorario={agregarHorario}
      accionDesactivarHorario={desactivarHorario}
      accionCrearParada={crearParada}
    />
  );
}
