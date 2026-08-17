import { colores } from '@rutas/shared/tokens';
import { Text, View } from 'react-native';
import { Icono, type NombreIcono } from './Icono';

interface Props {
  titulo: string;
  /** Segunda linea opcional: para que el vacio no se lea como un error. */
  detalle?: string;
  icono?: NombreIcono;
}

/** El estado vacio comun a toda pantalla de listado del chofer. */
export function EstadoVacio({ titulo, detalle, icono = 'hoy' }: Props) {
  return (
    <View className="items-center justify-center gap-3 px-6 py-16">
      <Icono nombre={icono} tamano={40} color={colores.fgMuted} />
      <Text className="text-center text-lg font-semibold text-foreground">{titulo}</Text>
      {detalle ? (
        <Text className="text-center text-base text-foreground-muted">{detalle}</Text>
      ) : null}
    </View>
  );
}
