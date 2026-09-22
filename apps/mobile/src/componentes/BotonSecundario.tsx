import { Pressable, Text } from 'react-native';

interface Props {
  etiqueta: string;
  onPress: () => void;
  deshabilitado?: boolean;
  /** Para acciones de apoyo que igual son irreversibles (terminar por incidente). */
  destructivo?: boolean;
  testID?: string;
}

/**
 * Accion de apoyo: contorno para no competir con `BotonPrimario`, y 56px de alto
 * para que la jerarquia se vea antes de leer, sin bajar del minimo tactil.
 */
export function BotonSecundario({ etiqueta, onPress, deshabilitado, destructivo, testID }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ disabled: Boolean(deshabilitado) }}
      className={`items-center justify-center rounded-app border px-4 disabled:opacity-40 ${
        destructivo ? 'border-destructive bg-background' : 'border-border bg-background'
      }`}
      style={{ minHeight: 56 }}
      disabled={deshabilitado}
      onPress={onPress}
      testID={testID}
    >
      <Text
        className={`text-center text-base font-semibold ${
          destructivo ? 'text-destructive' : 'text-foreground'
        }`}
      >
        {etiqueta}
      </Text>
    </Pressable>
  );
}
