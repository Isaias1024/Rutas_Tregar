import { Pressable, Text } from 'react-native';

interface Props {
  etiqueta: string;
  onPress: () => void;
  deshabilitado?: boolean;
  testID?: string;
}

/**
 * Accion de apoyo: cancelar un dialogo, reintentar una carga. Contorno en vez
 * de relleno para que nunca compita con el `BotonPrimario` — la regla del
 * proyecto es un solo objetivo tactil dominante por pantalla, y este no lo es.
 *
 * 56px de alto: mas bajo que los 72 del primario a proposito (la jerarquia se
 * ve antes de leer), pero por encima del minimo tactil de 44px.
 */
export function BotonSecundario({ etiqueta, onPress, deshabilitado, testID }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ disabled: Boolean(deshabilitado) }}
      className="items-center justify-center rounded-app border border-border bg-background px-4 disabled:opacity-40"
      style={{ minHeight: 56 }}
      disabled={deshabilitado}
      onPress={onPress}
      testID={testID}
    >
      <Text className="text-center text-base font-semibold text-foreground">{etiqueta}</Text>
    </Pressable>
  );
}
