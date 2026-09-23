import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { BotonSecundario } from '@/componentes/BotonSecundario';
import { supabase } from '@/lib/supabase';
import { useSesion } from './_layout';

/**
 * Dos entradas: la forzada del primer ingreso, de la que saca el guard de
 * `_layout.tsx`, y la voluntaria (`?voluntario=1`), que se abandona a mano.
 */
export default function PaginaCambiarPassword() {
  const { usuario, refrescarUsuario } = useSesion();
  const { voluntario } = useLocalSearchParams<{ voluntario?: string }>();
  const esVoluntario = voluntario === '1';
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  function volver() {
    // Entrar por deep link deja la pila vacia y `back()` no tendria a donde ir.
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(chofer)/perfil');
  }

  async function guardar() {
    if (nueva.length < 8) {
      setError('La contrasena debe tener al menos 8 caracteres.');
      return;
    }
    if (nueva !== confirmacion) {
      setError('Las dos contrasenas no coinciden.');
      return;
    }

    setCargando(true);
    setError(null);

    const { error: errorPassword } = await supabase.auth.updateUser({ password: nueva });
    if (errorPassword) {
      setCargando(false);
      setError('No se pudo cambiar la contrasena. Intenta de nuevo.');
      return;
    }

    // El guard de _layout.tsx solo deja de mandar aqui cuando esta columna se
    // apaga; en el cambio voluntario ya vale `false` y no hay nada que apagar.
    if (usuario?.debeCambiarPassword) {
      await supabase.from('usuario').update({ debe_cambiar_password: false }).eq('id', usuario.id);
    }
    await refrescarUsuario();
    setCargando(false);
    setExito(true);
  }

  // Solo el cambio voluntario necesita esta pantalla: en el forzado, apagar la
  // columna hace que el guard saque de aqui de inmediato.
  if (exito && esVoluntario) {
    return (
      <View className="flex-1 justify-center bg-background px-6">
        <Text className="mb-2 text-center text-2xl font-semibold text-foreground">
          Contrasena actualizada
        </Text>
        <Text className="mb-8 text-center text-base text-foreground-muted">
          Usa la nueva la proxima vez que entres.
        </Text>
        <Pressable
          className="h-[72px] items-center justify-center rounded-app bg-primary"
          onPress={volver}
          testID="boton-volver"
        >
          <Text className="text-xl font-semibold text-primary-fg">Volver</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 justify-center bg-background px-6">
      <Text className="mb-2 text-center text-2xl font-semibold text-foreground">
        {esVoluntario ? 'Cambiar contrasena' : 'Cambia tu contrasena'}
      </Text>
      <Text className="mb-8 text-center text-base text-foreground-muted">
        {esVoluntario
          ? 'Elige una contrasena nueva. Minimo 8 caracteres.'
          : 'Es tu primer ingreso. Elige una contrasena nueva para continuar.'}
      </Text>

      <View className="mb-4">
        <Text className="mb-1 text-base font-medium text-foreground">Contrasena nueva</Text>
        <TextInput
          className="h-14 rounded-app border border-border px-4 text-lg text-foreground"
          secureTextEntry
          autoCapitalize="none"
          value={nueva}
          onChangeText={setNueva}
          editable={!cargando}
          testID="campo-nueva-password"
        />
      </View>

      <View className="mb-6">
        <Text className="mb-1 text-base font-medium text-foreground">Confirma la contrasena</Text>
        <TextInput
          className="h-14 rounded-app border border-border px-4 text-lg text-foreground"
          secureTextEntry
          autoCapitalize="none"
          value={confirmacion}
          onChangeText={setConfirmacion}
          editable={!cargando}
          testID="campo-confirmacion-password"
        />
      </View>

      {error ? (
        <Text className="mb-4 text-center text-base text-destructive" testID="mensaje-error">
          {error}
        </Text>
      ) : null}

      <Pressable
        className="h-[72px] items-center justify-center rounded-app bg-primary"
        onPress={guardar}
        disabled={cargando}
        testID="boton-guardar"
      >
        {cargando ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text className="text-xl font-semibold text-primary-fg">Guardar</Text>
        )}
      </Pressable>

      {/* El primer ingreso NO lleva cancelar: es una compuerta, y salirse
          dejaria una cuenta usable con la contrasena que dio el supervisor. */}
      {esVoluntario ? (
        <View className="mt-3">
          <BotonSecundario etiqueta="Cancelar" onPress={volver} deshabilitado={cargando} />
        </View>
      ) : null}
    </View>
  );
}
