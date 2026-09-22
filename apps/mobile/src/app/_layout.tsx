import type { Session } from '@supabase/supabase-js';
import { Stack, useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import { createContext, useContext, useEffect, useState } from 'react';
import { IndicadorPendientes } from '@/componentes/indicador-pendientes';
import { supabase } from '@/lib/supabase';
import { registrarDispositivoPush } from '@/push/registrar';
import '../global.css';

interface UsuarioSesion {
  id: string;
  rol: 'admin' | 'supervisor' | 'chofer';
  debeCambiarPassword: boolean;
}

interface SesionContextValue {
  cargando: boolean;
  session: Session | null;
  usuario: UsuarioSesion | null;
  refrescarUsuario: () => Promise<void>;
}

const SesionContext = createContext<SesionContextValue | null>(null);

/** Consumido por login.tsx, cambiar-password.tsx y las pantallas protegidas. */
export function useSesion(): SesionContextValue {
  const contexto = useContext(SesionContext);
  if (!contexto) {
    throw new Error('useSesion debe usarse dentro del RootLayout');
  }
  return contexto;
}

async function cargarUsuario(userId: string): Promise<UsuarioSesion | null> {
  const { data, error } = await supabase
    .from('usuario')
    .select('id, rol, debe_cambiar_password')
    .eq('id', userId)
    .single();
  if (error || !data) {
    return null;
  }
  return { id: data.id, rol: data.rol, debeCambiarPassword: data.debe_cambiar_password };
}

export default function RootLayout() {
  const [cargando, setCargando] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const router = useRouter();
  const segmentos = useSegments();

  async function refrescarUsuario() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      setUsuario(await cargarUsuario(data.session.user.id));
    }
  }

  useEffect(() => {
    let activo = true;

    // Sesion y perfil se publican juntos: por separado, el efecto de abajo veria
    // `session` puesta con `usuario` aun null y redirigiria antes de tiempo.
    async function sincronizar(nuevaSesion: Session | null) {
      setCargando(true);
      const usuarioCargado = nuevaSesion ? await cargarUsuario(nuevaSesion.user.id) : null;
      if (!activo) {
        return;
      }
      setSession(nuevaSesion);
      setUsuario(usuarioCargado);
      setCargando(false);
    }

    supabase.auth.getSession().then(({ data }) => sincronizar(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      sincronizar(nuevaSesion);
    });

    return () => {
      activo = false;
      subscription.unsubscribe();
    };
  }, []);

  // `useGlobalSearchParams` y no `useLocalSearchParams`: este layout no es la
  // pantalla duena del parametro, y solo el global se actualiza desde una hija.
  const { voluntario } = useGlobalSearchParams<{ voluntario?: string }>();
  const cambioVoluntario = voluntario === '1';

  useEffect(() => {
    if (cargando) {
      return;
    }

    const enLogin = segmentos[0] === 'login';
    const enCambiarPassword = segmentos[0] === 'cambiar-password';

    if (!session) {
      if (!enLogin) {
        router.replace('/login');
      }
      return;
    }

    if (usuario?.debeCambiarPassword) {
      if (!enCambiarPassword) {
        router.replace('/cambiar-password');
      }
      return;
    }

    // `cambiar-password` tiene dos entradas: sin distinguir la voluntaria
    // (`?voluntario=1`), este `replace` expulsaba a "hoy" antes de verse.
    if (enLogin || (enCambiarPassword && !cambioVoluntario)) {
      router.replace('/');
    }
  }, [cargando, session, usuario, segmentos, cambioVoluntario, router]);

  // Solo con sesion utilizable, y sin manejo de error visible: un fallo de
  // permiso o de red no debe impedir el uso de la app.
  useEffect(() => {
    if (usuario && !usuario.debeCambiarPassword) {
      registrarDispositivoPush();
    }
  }, [usuario]);

  return (
    <SesionContext.Provider value={{ cargando, session, usuario, refrescarUsuario }}>
      <IndicadorPendientes />
      <Stack screenOptions={{ headerShown: false }} />
    </SesionContext.Provider>
  );
}
