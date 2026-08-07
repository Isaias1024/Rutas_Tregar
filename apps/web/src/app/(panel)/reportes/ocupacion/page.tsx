import { ReportesNav } from '../reportes-nav';
import { OcupacionCliente } from './ocupacion-cliente';

export const dynamic = 'force-dynamic';

export default function PaginaOcupacion() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Reportes</h1>
      <ReportesNav />
      <OcupacionCliente />
    </div>
  );
}
