import { Pressable, ScrollView, Text, View } from 'react-native';

const DIAS_CORTOS = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];

export interface DiaSemana {
  /** 'YYYY-MM-DD'. */
  fecha: string;
  cantidadRutas: number;
}

interface Props {
  dias: DiaSemana[];
  fechaSeleccionada: string;
  /** El dia operativo real, para marcar cual es "hoy" aunque no este elegido. */
  hoy: string;
  onSeleccionar: (fecha: string) => void;
}

function partes(fecha: string): { etiqueta: string; numero: number } {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  if (anio === undefined || mes === undefined || dia === undefined) {
    return { etiqueta: '', numero: 0 };
  }
  // Ancla en UTC: `fecha` es un dia de calendario, no un instante.
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return { etiqueta: DIAS_CORTOS[diaSemana] ?? '', numero: dia };
}

/**
 * En `ScrollView` horizontal y no en siete columnas fijas, donde el numero se
 * corta. El dia elegido se rellena; HOY lleva un punto: son dos cosas distintas.
 */
export function SelectorDiaSemana({ dias, fechaSeleccionada, hoy, onSeleccionar }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-4"
    >
      {dias.map((dia) => {
        const { etiqueta, numero } = partes(dia.fecha);
        const elegido = dia.fecha === fechaSeleccionada;
        const esHoy = dia.fecha === hoy;
        return (
          <Pressable
            key={dia.fecha}
            accessibilityRole="button"
            accessibilityState={{ selected: elegido }}
            accessibilityLabel={`${etiqueta} ${numero}, ${dia.cantidadRutas} rutas`}
            onPress={() => onSeleccionar(dia.fecha)}
            className={`items-center rounded-app border px-3 py-2 ${
              elegido ? 'border-primary bg-primary' : 'border-border bg-surface'
            }`}
            style={{ minWidth: 60 }}
          >
            <Text
              className={`text-xs font-semibold ${
                elegido ? 'text-primary-fg' : 'text-foreground-muted'
              }`}
            >
              {etiqueta}
            </Text>
            <Text
              className={`text-xl font-bold tabular-nums ${
                elegido ? 'text-primary-fg' : 'text-foreground'
              }`}
            >
              {numero}
            </Text>
            <Text
              className={`text-xs tabular-nums ${
                elegido ? 'text-primary-fg' : 'text-foreground-muted'
              }`}
            >
              {dia.cantidadRutas > 0 ? `${dia.cantidadRutas} rutas` : '—'}
            </Text>
            <View
              className={`mt-1 rounded-full ${elegido ? 'bg-primary-fg' : 'bg-primary'}`}
              style={{ width: 4, height: 4, opacity: esHoy ? 1 : 0 }}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
