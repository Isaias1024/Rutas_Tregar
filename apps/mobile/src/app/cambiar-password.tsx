import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useSesion } from './_layout';

export default function PaginaCambiarPassword() {
  const { usuario, refrescarUsuario } = useSesion();
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    // El guard de _layout.tsx solo deja de mandar aqui cuando esta columna
    // se apaga; el UPDATE la exige RLS (`usuario_update_debe_cambiar_password`,
    // paso 8) con GRANT restringido a esa unica columna.
    if (usuario) {
      await supabase.from('usuario').update({ debe_cambiar_password: false }).eq('id', usuario.id);
    }
    await refrescarUsuario();
    setCargando(false);
  }

  return (
    <View className="flex-1 justify-center bg-background px-6">
      <Text className="mb-2 text-center text-2xl font-semibold text-foreground">
        Cambia tu contrasena
      </Text>
      <Text className="mb-8 text-center text-base text-foreground-muted">
        Es tu primer ingreso. Elige una contrasena nueva para continuar.
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
    </View>
  );
}
