import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { correoDesdeCredencial } from './credencial';

// Unico cliente de Supabase de la app. La sesion vive en expo-secure-store
// (cifrado por el sistema operativo), nunca en AsyncStorage: es lo que deja
// reabrir la app sin volver a pedir credenciales (Done-when del paso 8).
const almacenSeguro = {
  getItem: (clave: string) => SecureStore.getItemAsync(clave),
  setItem: (clave: string, valor: string) => SecureStore.setItemAsync(clave, valor),
  removeItem: (clave: string) => SecureStore.deleteItemAsync(clave),
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'apps/mobile/src/lib/supabase.ts: faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: almacenSeguro,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// El chofer solo teclea credencial y contrasena — la sintesis del correo
// interno queda encapsulada aqui para que `login.tsx` nunca tenga que
// nombrarla (Verify del paso 8 lo comprueba: `login.tsx` no puede mencionar
// "correo" en ningun lado, ni siquiera en el nombre de un import).
export function iniciarSesionConCredencial(credencial: string, contrasena: string) {
  return supabase.auth.signInWithPassword({
    email: correoDesdeCredencial(credencial),
    password: contrasena,
  });
}
