import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BotonSecundario } from '@/componentes/BotonSecundario';
import { DialogoTelefono } from '@/componentes/DialogoTelefono';
import { ModalConfirmacion } from '@/componentes/ModalConfirmacion';
import { TarjetaPerfil } from '@/componentes/TarjetaPerfil';
import { usePerfil } from '@/datos/usePerfil';
import { supabase } from '@/lib/supabase';
import { almacenSqlite } from '@/outbox/db';

/**
 * Perfil del chofer. Lo unico editable es el telefono, porque es lo unico que
 * RLS le concede: los demas campos los rechazaria Postgres al guardar.
 */
export default function PaginaPerfil() {
  const { perfil, cargando, recargar } = usePerfil();
  const [editandoTelefono, setEditandoTelefono] = useState(false);
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [avisoPendientes, setAvisoPendientes] = useState<string | null>(null);

  async function pedirCerrarSesion() {
    // El outbox vive en SQLite y solo el flusher autenticado puede entregarlo.
    // Se avisa en vez de impedirlo: el chofer sigue siendo quien decide.
    const pendientes = await almacenSqlite.listar();
    setAvisoPendientes(
      pendientes.length > 0
        ? `Tienes ${pendientes.length} registro(s) sin enviar. Conectate a internet antes de salir para no perderlos.`
        : null,
    );
    setConfirmandoSalida(true);
  }

  async function cerrarSesion() {
    setSaliendo(true);
    await supabase.auth.signOut();
    setSaliendo(false);
    setConfirmandoSalida(false);
    // El layout raiz observa `onAuthStateChange` y redirige solo; este replace
    // evita el parpadeo de la pantalla anterior mientras eso ocurre.
    router.replace('/login');
  }

  if (cargando) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background" edges={['top']}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
        <Text className="text-2xl font-bold text-foreground">Perfil</Text>

        {perfil ? (
          <TarjetaPerfil perfil={perfil} />
        ) : (
          <Text className="text-base text-foreground-muted">
            No pudimos cargar tu perfil. Desliza para reintentar o vuelve a entrar.
          </Text>
        )}

        <View className="gap-2">
          <BotonSecundario
            etiqueta="Cambiar telefono"
            onPress={() => setEditandoTelefono(true)}
            deshabilitado={!perfil}
          />
          <BotonSecundario
            etiqueta="Cambiar contraseña"
            // `voluntario` distingue esta entrada de la forzada: sin el, el
            // guard de `_layout.tsx` devuelve a "hoy" antes de verse la pantalla.
            onPress={() =>
              router.push({ pathname: '/cambiar-password', params: { voluntario: '1' } })
            }
          />
          <BotonSecundario etiqueta="Cerrar sesion" onPress={pedirCerrarSesion} />
        </View>
      </ScrollView>

      <DialogoTelefono
        visible={editandoTelefono}
        telefonoActual={perfil?.telefono ?? ''}
        onCerrar={() => setEditandoTelefono(false)}
        onGuardado={async () => {
          setEditandoTelefono(false);
          await recargar();
        }}
      />

      <ModalConfirmacion
        visible={confirmandoSalida}
        titulo="Cerrar sesion"
        descripcion={
          avisoPendientes ??
          'Vas a salir de tu cuenta. Tendras que entrar de nuevo con tu credencial.'
        }
        etiquetaConfirmar="Cerrar sesion"
        ocupado={saliendo}
        onConfirmar={cerrarSesion}
        onCancelar={() => setConfirmandoSalida(false)}
      />
    </SafeAreaView>
  );
}
