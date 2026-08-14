import { fechaOperativa } from '@rutas/shared';
import {
  asignar,
  cancelar,
  listarAsignacionesSemana,
  listarChoferesElegibles,
  listarHorariosActivos,
  reasignar,
} from '@/server/planeador';
import { PlaneadorSemana } from './planeador-semana';
import { EncabezadoPagina } from '@/components/shell/encabezado-pagina';

export const dynamic = 'force-dynamic';

function lunesDeSemana(fecha: Date): Date {
  const dia = fecha.getDay(); // 0 = domingo
  const diferencia = dia === 0 ? -6 : 1 - dia;
  const lunes = new Date(fecha);
  lunes.setDate(fecha.getDate() + diferencia);
  lunes.setHours(0, 0, 0, 0);
  return lunes;
}

function aISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function sumarDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

export default async function PaginaPlaneador({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  const { semana } = await searchParams;
  // "Hoy" se calcula por zona IANA (America/Mexico_City), no por la hora
  // local del host: en un servidor en UTC, `new Date()` puede caer del otro
  // lado de la medianoche justo en el turno de noche.
  const hoy = fechaOperativa(new Date());
  const base =
    semana && /^\d{4}-\d{2}-\d{2}$/.test(semana)
      ? new Date(`${semana}T00:00:00`)
      : new Date(`${hoy}T00:00:00`);
  const lunes = lunesDeSemana(base);
  const fechas = Array.from({ length: 7 }, (_, indice) => aISO(sumarDias(lunes, indice)));

  const [horarios, asignaciones, choferes] = await Promise.all([
    listarHorariosActivos(),
    listarAsignacionesSemana(fechas),
    listarChoferesElegibles(),
  ]);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Planeador semanal"
        descripcion="Asigna un chofer a cada horario de la semana. El camion lo trae el chofer."
      />
      <PlaneadorSemana
        fechas={fechas}
        hoy={hoy}
        horarios={horarios}
        asignaciones={asignaciones}
        choferes={choferes}
        semanaAnteriorHref={`/planeador?semana=${aISO(sumarDias(lunes, -7))}`}
        semanaSiguienteHref={`/planeador?semana=${aISO(sumarDias(lunes, 7))}`}
        accionAsignar={asignar}
        accionReasignar={reasignar}
        accionCancelar={cancelar}
      />
    </div>
  );
}
