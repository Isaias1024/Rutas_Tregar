import { ReportesNav } from '../reportes-nav';
import { ResumenClienteTabla } from './resumen-cliente-tabla';
import { EncabezadoPagina } from '@/components/shell/encabezado-pagina';

export const dynamic = 'force-dynamic';

export default function PaginaReporteCliente() {
  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Reportes"
        descripcion="Cumplimiento, ocupacion y ejecuciones por periodo."
      />
      <ReportesNav />
      <ResumenClienteTabla />
    </div>
  );
}
