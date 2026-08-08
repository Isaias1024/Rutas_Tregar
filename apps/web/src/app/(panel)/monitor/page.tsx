import { TZDate } from '@date-fns/tz';
import { MonitorTabla } from './monitor-tabla';

export const dynamic = 'force-dynamic';

function fechaOperativaHoy(): string {
  const ahora = TZDate.tz('America/Mexico_City');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
}

export default function PaginaMonitor() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Monitor</h1>
        <p className="text-sm text-muted-foreground">Estado en vivo de las rutas de hoy.</p>
      </div>
      <MonitorTabla fecha={fechaOperativaHoy()} />
    </div>
  );
}
