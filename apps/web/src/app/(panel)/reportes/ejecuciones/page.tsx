import { ReportesNav } from '../reportes-nav';
import { EjecucionesCliente } from './ejecuciones-cliente';

export const dynamic = 'force-dynamic';

export default function PaginaEjecuciones() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Reportes</h1>
      <ReportesNav />
      <EjecucionesCliente />
    </div>
  );
}
