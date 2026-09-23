import { colores } from '@rutas/shared/tokens';
import { Tabs } from 'expo-router';
import { Icono, type NombreIcono } from '@/componentes/Icono';

function icono(nombre: NombreIcono) {
  return ({ color }: { color: string }) => <Icono nombre={nombre} tamano={22} color={color} />;
}

/**
 * `height: 'auto'` con padding y no altura fija: con gesto de navegacion la barra
 * necesita mas alto, y una medida fija recorta las etiquetas en unos u otros.
 */
export default function LayoutChofer() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colores.primary,
        tabBarInactiveTintColor: colores.fgMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: colores.background,
          borderTopColor: colores.border,
          paddingTop: 6,
          paddingBottom: 6,
        },
      }}
    >
      <Tabs.Screen name="hoy" options={{ title: 'Hoy', tabBarIcon: icono('hoy') }} />
      <Tabs.Screen name="semana" options={{ title: 'Semana', tabBarIcon: icono('semana') }} />
      <Tabs.Screen
        name="historial"
        options={{ title: 'Historial', tabBarIcon: icono('historial') }}
      />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil', tabBarIcon: icono('perfil') }} />
      {/* El detalle vive dentro del grupo pero fuera de la barra. */}
      <Tabs.Screen name="ruta/[id]" options={{ href: null }} />
    </Tabs>
  );
}
