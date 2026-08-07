import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSesion } from './_layout';

// Pantalla protegida por el guard de _layout.tsx: solo se llega aqui con
// sesion valida y debe_cambiar_password ya en false. De aqui en adelante
// vive la navegacion real del chofer (paso 9).
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
