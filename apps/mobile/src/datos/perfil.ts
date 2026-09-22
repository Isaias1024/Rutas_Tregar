import { supabase } from '@/lib/supabase';

/**
 * El perfil que la app puede mostrar. Sin correo (el chofer entra con credencial)
 * y sin foto: `perfil_personal` no guarda ninguna, el avatar son las iniciales.
 */
export interface PerfilChofer {
  nombre: string;
  credencial: string;
  telefono: string | null;
  camionCodigo: string | null;
}

interface FilaUsuario {
  credencial: string;
  camion: { codigo: string } | null;
}

/**
 * `perfil_personal` y `usuario` van por separado porque son dos politicas RLS
 * distintas. Un fallo en una deja el campo vacio en vez de tumbar la pantalla.
 */
export async function obtenerPerfil(usuarioId: string): Promise<PerfilChofer | null> {
  const [respuestaPerfil, respuestaUsuario] = await Promise.all([
    supabase
      .from('perfil_personal')
      .select('nombre, telefono')
      .eq('usuario_id', usuarioId)
      .maybeSingle(),
    supabase
      .from('usuario')
      .select('credencial, camion:camion_id(codigo)')
      .eq('id', usuarioId)
      .maybeSingle(),
  ]);

  const usuario = respuestaUsuario.data as FilaUsuario | null;
  if (!usuario) {
    return null;
  }

  return {
    nombre: respuestaPerfil.data?.nombre ?? '',
    credencial: usuario.credencial,
    telefono: respuestaPerfil.data?.telefono ?? null,
    camionCodigo: usuario.camion?.codigo ?? null,
  };
}

/**
 * El telefono es la UNICA columna que el chofer puede escribir de su perfil:
 * cualquier otra la rechaza Postgres, no esta funcion.
 */
export async function actualizarTelefono(
  usuarioId: string,
  telefono: string,
): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const { error } = await supabase
    .from('perfil_personal')
    .update({ telefono })
    .eq('usuario_id', usuarioId);

  if (error) {
    return { ok: false, mensaje: 'No se pudo guardar tu telefono. Intenta de nuevo.' };
  }
  return { ok: true };
}

/** Iniciales para el avatar: nunca mas de dos letras, siempre en mayuscula. */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) {
    return '?';
  }
  const primera = palabras[0]?.[0] ?? '';
  const segunda = palabras.length > 1 ? (palabras[palabras.length - 1]?.[0] ?? '') : '';
  return `${primera}${segunda}`.toUpperCase();
}
