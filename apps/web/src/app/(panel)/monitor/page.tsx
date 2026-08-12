import { TZDate } from '@date-fns/tz';
import { MonitorTabla } from './monitor-tabla';
import { EncabezadoPagina } from '@/components/shell/encabezado-pagina';

export const dynamic = 'force-dynamic';

function fechaOperativaHoy(): string {
  const ahora = TZDate.tz('America/Mexico_City');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
}

export default function PaginaMonitor() {
  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Monitor" descripcion="Estado en vivo de las rutas de hoy." />
      <MonitorTabla fecha={fechaOperativaHoy()} />
    </div>
  );
}
