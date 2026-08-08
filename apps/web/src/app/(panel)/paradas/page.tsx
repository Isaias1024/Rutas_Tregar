import { env } from '@/lib/env';
import { crearParada, editarParada, listarParadas } from '@/server/paradas';
import { TablaParadas } from './tabla-paradas';

export const dynamic = 'force-dynamic';

export default async function PaginaParadas() {
  const paradas = await listarParadas();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Paradas</h1>
      <TablaParadas
        paradas={paradas}
        accionCrear={crearParada}
        accionEditar={editarParada}
        apiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
      />
    </div>
  );
}
