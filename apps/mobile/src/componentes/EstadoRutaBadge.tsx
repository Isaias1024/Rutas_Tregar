import type { EstadoRuta } from '@rutas/shared';
import { colores } from '@rutas/shared/tokens';
import { Text, View } from 'react-native';

/**
 * Pastilla de color pleno con SU TEXTO DENTRO: un chofer daltonico, o con el
 * telefono al sol, lee el estado. Los pares fg/bg salen de los tokens comunes.
 */
const ESTILO: Record<EstadoRuta, { texto: string; fg: string; bg: string }> = {
  pendiente: { texto: 'PENDIENTE', fg: colores.fg, bg: '#F1F5F9' },
  en_curso: { texto: 'EN CURSO', fg: '#FFFFFF', bg: colores.warning },
  completada: { texto: 'COMPLETADA', fg: '#FFFFFF', bg: colores.success },
  cancelada: { texto: 'CANCELADA', fg: '#FFFFFF', bg: colores.fgMuted },
};

interface Props {
  estado: EstadoRuta;
}

export function EstadoRutaBadge({ estado }: Props) {
  const { texto, fg, bg } = ESTILO[estado];
  return (
    <View className="self-start rounded-full px-2.5 py-1" style={{ backgroundColor: bg }}>
      <Text className="text-xs font-bold" style={{ color: fg }}>
        {texto}
      </Text>
    </View>
  );
}
