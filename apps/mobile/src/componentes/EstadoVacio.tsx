import { Text, View } from 'react-native';

interface Props {
  titulo: string;
}

/** El estado vacio comun a toda pantalla de listado del chofer. */
export function EstadoVacio({ titulo }: Props) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-6 py-16">
      <Text className="text-center text-base text-foreground-muted">{titulo}</Text>
    </View>
  );
}
