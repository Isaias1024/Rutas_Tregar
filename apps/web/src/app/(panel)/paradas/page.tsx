import { env } from '@/lib/env';
import {
  borrarParada,
  consultarRutasQueUsanParada,
  crearParada,
  editarParada,
  listarParadas,
} from '@/server/paradas';
import { TablaParadas } from './tabla-paradas';

export const dynamic = 'force-dynamic';

export default async function PaginaParadas() {
  const paradas = await listarParadas();

  return (
    <TablaParadas
      titulo="Paradas"
      descripcion="Puntos de ascenso y descenso. Las rutas los referencian; no guardan una copia."
      paradas={paradas}
      accionCrear={crearParada}
      accionEditar={editarParada}
      accionBorrar={borrarParada}
      accionConsultarRutas={consultarRutasQueUsanParada}
      apiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
    />
  );
}
