import { colores } from '@rutas/shared/tokens';
import { Tabs } from 'expo-router';

// Navegacion del chofer: dos pestanas, Hoy y Semana (paso 9). El detalle de
// ruta (paso 10) se abre encima como pantalla, no como una tercera pestana.
export default function LayoutChofer() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colores.primary,
        tabBarLabelStyle: { fontSize: 14, fontWeight: '600' },
        tabBarStyle: { height: 56 },
      }}
    >
      <Tabs.Screen name="hoy" options={{ title: 'Hoy' }} />
      <Tabs.Screen name="semana" options={{ title: 'Semana' }} />
    </Tabs>
  );
}
