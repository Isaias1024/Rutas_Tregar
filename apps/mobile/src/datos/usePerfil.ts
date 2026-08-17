import { useCallback, useEffect, useState } from 'react';
import { useSesion } from '@/app/_layout';
import { obtenerPerfil, type PerfilChofer } from './perfil';

interface EstadoPerfil {
  perfil: PerfilChofer | null;
  cargando: boolean;
  recargar: () => Promise<void>;
}

/**
 * El perfil del chofer en sesion. Lo usan el saludo de "Hoy" y la pantalla de
 * Perfil.
 *
 * Nunca lanza: el saludo es adorno y la pantalla de Perfil ya distingue el
 * caso vacio. Tumbar "Hoy" — la pantalla de trabajo — porque no se pudo leer
 * un nombre seria cambiar un detalle cosmetico por la funcion principal.
 */
export function usePerfil(): EstadoPerfil {
  const { usuario } = useSesion();
  const [perfil, setPerfil] = useState<PerfilChofer | null>(null);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    if (!usuario) {
      setPerfil(null);
      setCargando(false);
      return;
    }
    try {
      setPerfil(await obtenerPerfil(usuario.id));
    } catch {
      setPerfil(null);
    }
  }, [usuario]);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    recargar().finally(() => {
      if (activo) {
        setCargando(false);
      }
    });
    return () => {
      activo = false;
    };
  }, [recargar]);

  return { perfil, cargando, recargar };
}
