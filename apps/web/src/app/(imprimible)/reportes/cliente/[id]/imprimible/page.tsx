import { notFound } from 'next/navigation';
import { PastillaEstado } from '@/components/pastilla-estado';
import {
  obtenerClientePorId,
  obtenerCumplimientoPorRutaDeCliente,
  obtenerOcupacionPorRuta,
} from '@/server/reportes';
import { GraficaOcupacionImprimible } from './grafica-ocupacion-imprimible';

// Fuera de `(panel)` A PROPOSITO: ese layout exige sesion de cookies y Chromium
// llega con `x-rutas-worker-secret`, sin ensanchar el bypass al layout entero.
export const dynamic = 'force-dynamic';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function aFechaTexto(fecha: Date): string {
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

function rangoPorDefecto() {
  const hoy = new Date();
  const hace30 = new Date(hoy);
  hace30.setDate(hoy.getDate() - 30);
  return { desde: aFechaTexto(hace30), hasta: aFechaTexto(hoy) };
}

function formatoPorcentaje(aTiempo: number, total: number): string {
  if (total === 0) {
    return 'Sin ejecuciones';
  }
  return `${Math.round((aTiempo / total) * 100)}%`;
}

export default async function PaginaImprimible({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { id } = await params;
  const { desde: desdeParam, hasta: hastaParam } = await searchParams;
  const porDefecto = rangoPorDefecto();
  const desde = desdeParam ?? porDefecto.desde;
  const hasta = hastaParam ?? porDefecto.hasta;

  const cliente = await obtenerClientePorId(id);
  if (!cliente) {
    notFound();
  }

  const [cumplimiento, ocupacion] = await Promise.all([
    obtenerCumplimientoPorRutaDeCliente(id, desde, hasta),
    obtenerOcupacionPorRuta(desde, hasta, { clienteId: id }),
  ]);

  const ocupacionPorRuta = new Map(ocupacion.map((fila) => [fila.rutaId, fila]));
  const datosGrafica = ocupacion.map((fila) => ({
    rutaNombre: fila.rutaNombre,
    esperadosPromedio: fila.esperadosPromedio,
    abordaronPromedio: fila.abordaronPromedio,
    retornaronPromedio: fila.retornaronPromedio,
  }));

  return (
    <main className="mx-auto max-w-[900px] space-y-8 p-8 text-foreground">
      <header className="space-y-1 border-b border-border pb-4">
        <p className="text-sm font-medium text-muted-foreground">Rutas — Transporte de Personal</p>
        <h1 className="text-2xl font-semibold">{cliente.nombre}</h1>
        <p className="tabular-nums text-sm text-muted-foreground">
          Del {desde} al {hasta}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Puntualidad y ocupacion por ruta</h2>
        {cumplimiento.length === 0 && ocupacion.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin ejecuciones en este rango.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="h-10 font-medium">Ruta</th>
                <th className="h-10 font-medium">Ultimo estado</th>
                <th className="h-10 text-right font-medium">App — a tiempo</th>
                <th className="h-10 text-right font-medium">Supervisor — a tiempo</th>
                <th className="h-10 text-right font-medium">Esperados</th>
                <th className="h-10 text-right font-medium">Abordaron</th>
                <th className="h-10 text-right font-medium">Retornaron</th>
              </tr>
            </thead>
            <tbody>
              {cumplimiento.map((fila) => {
                const ocupacionFila = ocupacionPorRuta.get(fila.rutaId);
                return (
                  <tr key={fila.rutaId} className="border-b border-border">
                    <td className="py-2">{fila.rutaNombre}</td>
                    <td className="py-2">
                      {fila.ultimoEstado ? (
                        <PastillaEstado estado={fila.ultimoEstado} />
                      ) : (
                        <span className="text-muted-foreground">Sin ejecuciones</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatoPorcentaje(fila.app.aTiempo, fila.app.total)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatoPorcentaje(fila.supervisor.aTiempo, fila.supervisor.total)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {ocupacionFila ? Math.round(ocupacionFila.esperadosPromedio * 10) / 10 : '—'}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {ocupacionFila?.abordaronPromedio === null ||
                      ocupacionFila?.abordaronPromedio === undefined
                        ? 'Sin datos'
                        : Math.round(ocupacionFila.abordaronPromedio * 10) / 10}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {ocupacionFila?.retornaronPromedio === null ||
                      ocupacionFila?.retornaronPromedio === undefined
                        ? 'Sin datos'
                        : Math.round(ocupacionFila.retornaronPromedio * 10) / 10}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {datosGrafica.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Ocupacion promedio por ruta</h2>
          <GraficaOcupacionImprimible datos={datosGrafica} />
        </section>
      ) : null}
    </main>
  );
}
