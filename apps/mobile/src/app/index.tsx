import { Pressable, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useSesion } from './_layout';

// Pantalla de inicio protegida por el guard de _layout.tsx: solo se llega
// aqui con sesion valida y debe_cambiar_password ya en false. Las pantallas
// reales de rutas del chofer llegan en los pasos siguientes.
export default function PaginaInicio() {
  const { usuario, cargando } = useSesion();

  if (cargando || !usuario) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-base text-foreground-muted">Cargando...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text className="text-2xl font-semibold text-foreground">Sesion iniciada</Text>
      <Pressable
        className="h-[72px] w-full items-center justify-center rounded-app border border-border"
        onPress={() => supabase.auth.signOut()}
      >
        <Text className="text-xl font-semibold text-foreground">Cerrar sesion</Text>
      </Pressable>
    </View>
  );
}
