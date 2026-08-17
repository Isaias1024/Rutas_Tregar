import type { EstadoRuta } from '@rutas/shared';
import { Pressable, ScrollView, Text } from 'react-native';

export type FiltroEstado = 'todas' | Extract<EstadoRuta, 'completada' | 'cancelada'>;

const OPCIONES: { valor: FiltroEstado; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'completada', etiqueta: 'Completadas' },
  { valor: 'cancelada', etiqueta: 'Canceladas' },
];

interface Props {
  valor: FiltroEstado;
  onCambiar: (valor: FiltroEstado) => void;
}

/**
 * Filtro del historial: solo los estados que de verdad aparecen ahi.
 *
 * No hay "pendiente" ni "en curso" a proposito — el historial llega hasta
 * ayer, y una ruta de ayer sin terminar no es un estado que el chofer pueda
 * accionar desde aqui. Ofrecer filtros que casi siempre devuelven vacio hace
 * ver la pantalla rota.
 */
export function FiltroHistorial({ valor, onCambiar }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-4"
    >
      {OPCIONES.map((opcion) => {
        const activo = opcion.valor === valor;
        return (
          <Pressable
            key={opcion.valor}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            onPress={() => onCambiar(opcion.valor)}
            className={`rounded-full border px-4 py-2 ${
              activo ? 'border-primary bg-primary' : 'border-border bg-surface'
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                activo ? 'text-primary-fg' : 'text-foreground-muted'
              }`}
            >
              {opcion.etiqueta}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
