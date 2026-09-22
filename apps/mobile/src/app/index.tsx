import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSesion } from './_layout';

// Protegida por el guard de _layout.tsx: solo se llega con sesion valida y
// `debe_cambiar_password` ya en false.
export default function PaginaInicio() {
  const { usuario, cargando } = useSesion();

  if (cargando || !usuario) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href="/(chofer)/hoy" />;
}
