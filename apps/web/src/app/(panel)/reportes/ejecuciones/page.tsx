import { ReportesNav } from '../reportes-nav';
import { EjecucionesCliente } from './ejecuciones-cliente';
import { EncabezadoPagina } from '@/components/shell/encabezado-pagina';

export const dynamic = 'force-dynamic';

export default function PaginaEjecuciones() {
  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Reportes"
        descripcion="Cumplimiento, ocupacion y ejecuciones por periodo."
      />
      <ReportesNav />
      <EjecucionesCliente />
    </div>
  );
}
