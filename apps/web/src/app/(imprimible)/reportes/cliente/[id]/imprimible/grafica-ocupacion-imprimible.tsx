'use client';

import { colores } from '@rutas/shared/tokens';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';

interface Fila {
  rutaNombre: string;
  esperadosPromedio: number;
  abordaronPromedio: number | null;
  retornaronPromedio: number | null;
}

// Sin `ResponsiveContainer` A PROPOSITO: ese componente mide su contenedor
// con un `ResizeObserver` que solo dispara DESPUES del primer paint, asi que
// el SVG llega vacio (0x0) hasta un segundo render. Chromium llama
// `page.pdf()` sin saber que hay que esperar ese segundo render, asi que la
// grafica saldria en blanco. Dimensiones fijas = un solo render sincrono,
// con la grafica ya pintada (§6: "se montan sincronamente para que Chromium
// encuentre el SVG ya pintado al llamar page.pdf()").
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
