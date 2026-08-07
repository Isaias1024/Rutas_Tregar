// La unica funcion de permisos del proyecto. Ninguna comprobacion de roles
// vive fuera de aqui — ni en una pagina, ni en un proxy, ni en un componente.
// Codifica la matriz de la §8 del blueprint.

export type Rol = 'admin' | 'supervisor' | 'chofer';

export interface UsuarioParaPermisos {
  id: string;
  rol: Rol;
}

/**
 * Acciones que no dependen de un recurso concreto: si el rol las tiene, las
 * tiene para cualquier fila.
 */
export type AccionSinRecurso =
  | 'ver_panel'
  | 'ver_monitor'
  | 'planear'
  | 'capturar_evento'
  | 'corregir_contadores'
  | 'generar_reportes'
  | 'gestionar_catalogos'
  | 'gestionar_rutas_paradas'
  | 'gestionar_usuarios'
  | 'dar_de_baja'
  | 'ver_bitacora';

/**
 * Acciones que solo el dueno del recurso puede ejercer: el chofer sobre su
 * propia asignacion o su propio perfil.
 */
export type AccionPropia =
  | 'ver_asignacion_propia'
  | 'insertar_evento_propio'
  | 'editar_perfil_propio';

/** `evento` es append-only: nadie tiene estas dos acciones, ni admin. */
export type AccionProhibida = 'editar_evento' | 'borrar_evento' | 'alterar_bitacora';

export type Accion = AccionSinRecurso | AccionPropia | AccionProhibida;

export type RecursoPropio = { choferId: string } | { usuarioId: string };

const PERMISOS: Record<Rol, ReadonlySet<AccionSinRecurso>> = {
  admin: new Set<AccionSinRecurso>([
    'ver_panel',
    'ver_monitor',
    'planear',
    'capturar_evento',
    'corregir_contadores',
    'generar_reportes',
    'gestionar_catalogos',
    'gestionar_rutas_paradas',
    'gestionar_usuarios',
    'dar_de_baja',
    'ver_bitacora',
  ]),
  supervisor: new Set<AccionSinRecurso>([
    'ver_panel',
    'ver_monitor',
    'planear',
    'capturar_evento',
    'corregir_contadores',
    'generar_reportes',
  ]),
  chofer: new Set<AccionSinRecurso>([]),
};

const ACCIONES_PROHIBIDAS: ReadonlySet<Accion> = new Set<AccionProhibida>([
  'editar_evento',
  'borrar_evento',
  'alterar_bitacora',
]);

const ACCIONES_PROPIAS: ReadonlySet<Accion> = new Set<AccionPropia>([
  'ver_asignacion_propia',
  'insertar_evento_propio',
  'editar_perfil_propio',
]);

function esDuenoDelRecurso(
  usuario: UsuarioParaPermisos,
  recurso: RecursoPropio | undefined,
): boolean {
  if (!recurso) {
    return false;
  }
  if ('choferId' in recurso) {
    return recurso.choferId === usuario.id;
  }
  return recurso.usuarioId === usuario.id;
}

export function can(
  usuario: UsuarioParaPermisos,
  accion: Accion,
  recurso?: RecursoPropio,
): boolean {
  if (ACCIONES_PROHIBIDAS.has(accion)) {
    return false;
  }

  if (ACCIONES_PROPIAS.has(accion)) {
    return esDuenoDelRecurso(usuario, recurso);
  }

  return PERMISOS[usuario.rol].has(accion as AccionSinRecurso);
}
