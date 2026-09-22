import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useSesion } from '@/app/_layout';
import { obtenerPerfil, type PerfilChofer } from './perfil';

interface EstadoPerfil {
  perfil: PerfilChofer | null;
  cargando: boolean;
  recargar: () => Promise<void>;
}

/**
 * El perfil del chofer en sesion. Nunca lanza: el saludo es adorno y tumbar
 * "Hoy" por no poder leer un nombre cambiaria lo principal por lo cosmetico.
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

  // El camion se edita desde el panel: sin esto, un chofer reasignado seguiria
  // viendo el viejo hasta cerrar sesion, porque el montaje solo corre una vez.
  useFocusEffect(
    useCallback(() => {
      recargar();
    }, [recargar]),
  );

  return { perfil, cargando, recargar };
}
