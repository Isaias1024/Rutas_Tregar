import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { iniciarSesionConCredencial } from '@/lib/supabase';

// Mensaje unico para credencial inexistente o contraseña incorrecta: nunca
// revela cual de las dos fallo (Done-when del paso 8).
const MENSAJE_GENERICO = 'Credencial o contraseña incorrecta.';

function abrirAvisoPrivacidad() {
  const baseUrl = process.env.EXPO_PUBLIC_PANEL_BASE_URL;
  if (baseUrl) {
    Linking.openURL(`${baseUrl}/privacidad`);
  }
}

export default function PaginaLogin() {
  const [credencial, setCredencial] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [contrasenaVisible, setContrasenaVisible] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function iniciarSesion() {
    if (!credencial.trim() || !contrasena) {
      setError(MENSAJE_GENERICO);
      return;
    }
    setCargando(true);
    setError(null);
    const { error: errorAuth } = await iniciarSesionConCredencial(credencial, contrasena);
    setCargando(false);
    if (errorAuth) {
      setError(MENSAJE_GENERICO);
    }
  }

  return (
    <View className="flex-1 justify-center bg-background px-6">
      <Text className="mb-8 text-center text-2xl font-semibold text-foreground">Rutas</Text>

      <View className="mb-4">
        <Text className="mb-1 text-base font-medium text-foreground">Credencial</Text>
        <TextInput
          className="h-14 rounded-app border border-border px-4 text-lg text-foreground"
          autoCapitalize="none"
          autoCorrect={false}
          value={credencial}
          onChangeText={setCredencial}
          editable={!cargando}
          testID="campo-credencial"
        />
      </View>

      <View className="mb-6">
        <Text className="mb-1 text-base font-medium text-foreground">Contraseña</Text>
        <View className="flex-row items-center rounded-app border border-border">
          <TextInput
            className="h-14 flex-1 px-4 text-lg text-foreground"
            secureTextEntry={!contrasenaVisible}
            autoCapitalize="none"
            value={contrasena}
            onChangeText={setContrasena}
            editable={!cargando}
            testID="campo-contrasena"
          />
          <Pressable
            onPress={() => setContrasenaVisible((visible) => !visible)}
            className="px-4"
            accessibilityLabel={contrasenaVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            <Text className="text-sm font-medium text-muted-foreground">
              {contrasenaVisible ? 'Ocultar' : 'Mostrar'}
            </Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <Text className="mb-4 text-center text-base text-destructive" testID="mensaje-error">
          {error}
        </Text>
      ) : null}

      <Pressable
        className="h-[72px] items-center justify-center rounded-app bg-primary"
        onPress={iniciarSesion}
        disabled={cargando}
        testID="boton-entrar"
      >
        {cargando ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text className="text-xl font-semibold text-primary-fg">Entrar</Text>
        )}
      </Pressable>

      <Pressable className="mt-6 items-center" onPress={abrirAvisoPrivacidad}>
        <Text className="text-sm text-muted-foreground underline">Aviso de privacidad</Text>
      </Pressable>
    </View>
  );
}
