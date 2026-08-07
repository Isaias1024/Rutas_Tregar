import { ReportesNav } from '../reportes-nav';
import { CumplimientoCliente } from './cumplimiento-cliente';

export const dynamic = 'force-dynamic';

export default function PaginaCumplimiento() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Reportes</h1>
      <ReportesNav />
      <CumplimientoCliente />
    </div>
  );
}
