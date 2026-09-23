// La unica funcion de permisos del proyecto: ninguna comprobacion de roles vive
// fuera de aqui, ni en una pagina, ni en un proxy, ni en un componente.

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
  | 'ver_bitacora'
  // Unica accion que distingue a admin de supervisor; la consume el alta de
  // supervisores (`crearSupervisor`), junto con 'gestionar_usuarios'.
  | 'crear_supervisor';

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

// Admin y supervisor comparten el mismo acceso de panel: la unica diferencia
// funcional entre ambos roles es 'crear_supervisor', abajo.
const PERMISOS_PANEL: readonly AccionSinRecurso[] = [
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
];

const PERMISOS: Record<Rol, ReadonlySet<AccionSinRecurso>> = {
  admin: new Set<AccionSinRecurso>([...PERMISOS_PANEL, 'crear_supervisor']),
  supervisor: new Set<AccionSinRecurso>(PERMISOS_PANEL),
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
