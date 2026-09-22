'use client';

import { colores } from '@rutas/shared/tokens';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';

interface Fila {
  rutaNombre: string;
  esperadosPromedio: number;
  abordaronPromedio: number | null;
  retornaronPromedio: number | null;
}

// Sin `ResponsiveContainer` A PROPOSITO: mide con un `ResizeObserver` posterior
// al primer paint, y `page.pdf()` no espera ese segundo render.
export function GraficaOcupacionImprimible({ datos }: { datos: Fila[] }) {
  return (
    <BarChart width={700} height={320} data={datos}>
      <CartesianGrid strokeDasharray="3 3" stroke={colores.border} />
      <XAxis dataKey="rutaNombre" tick={{ fontSize: 12 }} />
      <YAxis tick={{ fontSize: 12 }} />
      <Tooltip />
      <Legend />
      <Bar dataKey="esperadosPromedio" name="Esperados" fill={colores.fgMuted} />
      <Bar dataKey="abordaronPromedio" name="Abordaron" fill={colores.primary} />
      <Bar dataKey="retornaronPromedio" name="Retornaron" fill={colores.success} />
    </BarChart>
  );
}
