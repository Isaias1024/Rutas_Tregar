import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// Pide permiso, obtiene el token de Expo y lo manda a POST /api/dispositivos.
// Re-registrar reemplaza, no duplica: lo resuelve el upsert del servidor.

async function obtenerTokenExpo(): Promise<string | null> {
  const { status: estadoActual } = await Notifications.getPermissionsAsync();
  let permiso = estadoActual;
  if (permiso !== 'granted') {
    const solicitud = await Notifications.requestPermissionsAsync();
    permiso = solicitud.status;
  }
  if (permiso !== 'granted') {
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  return token;
}

export async function registrarDispositivoPush(): Promise<void> {
  const baseUrl = process.env.EXPO_PUBLIC_PANEL_BASE_URL;
  if (!baseUrl) {
    return;
  }

  const expoPushToken = await obtenerTokenExpo();
  if (!expoPushToken) {
    return;
  }

  const { data: sesion } = await supabase.auth.getSession();
  const accessToken = sesion.session?.access_token;
  if (!accessToken) {
    return;
  }

  await fetch(`${baseUrl}/api/dispositivos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      expoPushToken,
      plataforma: Platform.OS === 'ios' ? 'ios' : 'android',
      appVersion: Constants.expoConfig?.version ?? 'desconocida',
    }),
  });
}
