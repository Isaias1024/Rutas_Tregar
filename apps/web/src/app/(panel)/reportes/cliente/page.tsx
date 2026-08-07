import { ReportesNav } from '../reportes-nav';
import { ResumenClienteTabla } from './resumen-cliente-tabla';

export const dynamic = 'force-dynamic';

export default function PaginaReporteCliente() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Reportes</h1>
      <ReportesNav />
      <ResumenClienteTabla />
    </div>
  );
}
