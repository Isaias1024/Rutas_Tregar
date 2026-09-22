import { describe, expect, it } from 'vitest';
import { type Accion, can, type RecursoPropio, type Rol, type UsuarioParaPermisos } from './can.ts';

const ADMIN: UsuarioParaPermisos = { id: 'admin-1', rol: 'admin' as Rol };
const SUPERVISOR: UsuarioParaPermisos = { id: 'supervisor-1', rol: 'supervisor' as Rol };
const CHOFER: UsuarioParaPermisos = { id: 'chofer-1', rol: 'chofer' as Rol };
const OTRO_CHOFER_ID = 'chofer-2';

interface Caso {
  descripcion: string;
  usuario: UsuarioParaPermisos;
  accion: Accion;
  recurso?: RecursoPropio;
  esperado: boolean;
}

// Una fila por celda de la matriz, mas las negativas explicitas: supervisor
// tiene el mismo acceso que admin salvo 'crear_supervisor'.
const CASOS: Caso[] = [
  // --- admin: puede ---
  { descripcion: 'admin puede ver el panel', usuario: ADMIN, accion: 'ver_panel', esperado: true },
  {
    descripcion: 'admin puede ver el monitor',
    usuario: ADMIN,
    accion: 'ver_monitor',
    esperado: true,
  },
  {
    descripcion: 'admin puede planear y reasignar',
    usuario: ADMIN,
    accion: 'planear',
    esperado: true,
  },
  {
    descripcion: 'admin puede capturar un evento a mano',
    usuario: ADMIN,
    accion: 'capturar_evento',
    esperado: true,
  },
  {
    descripcion: 'admin puede corregir cnt_abordaron y cnt_retornaron',
    usuario: ADMIN,
    accion: 'corregir_contadores',
    esperado: true,
  },
  {
    descripcion: 'admin puede generar los cuatro reportes',
    usuario: ADMIN,
    accion: 'generar_reportes',
    esperado: true,
  },
  {
    descripcion: 'admin puede administrar clientes, camiones y choferes',
    usuario: ADMIN,
    accion: 'gestionar_catalogos',
    esperado: true,
  },
  {
    descripcion: 'admin puede administrar rutas y paradas',
    usuario: ADMIN,
    accion: 'gestionar_rutas_paradas',
    esperado: true,
  },
  {
    descripcion: 'admin puede crear y editar usuarios',
    usuario: ADMIN,
    accion: 'gestionar_usuarios',
    esperado: true,
  },
  {
    descripcion: 'admin puede dar de baja personal',
    usuario: ADMIN,
    accion: 'dar_de_baja',
    esperado: true,
  },
  {
    descripcion: 'admin puede ver la bitacora',
    usuario: ADMIN,
    accion: 'ver_bitacora',
    esperado: true,
  },
  {
    descripcion: 'admin puede crear un supervisor',
    usuario: ADMIN,
    accion: 'crear_supervisor',
    esperado: true,
  },
  // --- admin: no puede ---
  {
    descripcion: 'admin NO puede editar una fila de evento',
    usuario: ADMIN,
    accion: 'editar_evento',
    esperado: false,
  },
  {
    descripcion: 'admin NO puede borrar una fila de evento',
    usuario: ADMIN,
    accion: 'borrar_evento',
    esperado: false,
  },
  {
    descripcion: 'admin NO puede alterar la bitacora',
    usuario: ADMIN,
    accion: 'alterar_bitacora',
    esperado: false,
  },

  // --- supervisor: puede ---
  {
    descripcion: 'supervisor puede ver el panel',
    usuario: SUPERVISOR,
    accion: 'ver_panel',
    esperado: true,
  },
  {
    descripcion: 'supervisor puede ver el monitor',
    usuario: SUPERVISOR,
    accion: 'ver_monitor',
    esperado: true,
  },
  {
    descripcion: 'supervisor puede planear y reasignar',
    usuario: SUPERVISOR,
    accion: 'planear',
    esperado: true,
  },
  {
    descripcion: 'supervisor puede capturar un evento a mano',
    usuario: SUPERVISOR,
    accion: 'capturar_evento',
    esperado: true,
  },
  {
    descripcion: 'supervisor puede corregir contadores',
    usuario: SUPERVISOR,
    accion: 'corregir_contadores',
    esperado: true,
  },
  {
    descripcion: 'supervisor puede generar los cuatro reportes',
    usuario: SUPERVISOR,
    accion: 'generar_reportes',
    esperado: true,
  },
  {
    descripcion: 'supervisor puede crear y editar usuarios (excepto supervisores)',
    usuario: SUPERVISOR,
    accion: 'gestionar_usuarios',
    esperado: true,
  },
  {
    descripcion: 'supervisor puede dar de baja a un usuario',
    usuario: SUPERVISOR,
    accion: 'dar_de_baja',
    esperado: true,
  },
  {
    descripcion: 'supervisor puede administrar clientes, camiones y choferes',
    usuario: SUPERVISOR,
    accion: 'gestionar_catalogos',
    esperado: true,
  },
  {
    descripcion: 'supervisor puede administrar rutas y paradas',
    usuario: SUPERVISOR,
    accion: 'gestionar_rutas_paradas',
    esperado: true,
  },
  {
    descripcion: 'supervisor puede ver la bitacora completa',
    usuario: SUPERVISOR,
    accion: 'ver_bitacora',
    esperado: true,
  },
  // --- supervisor: no puede ---
  {
    descripcion: 'supervisor NO puede crear un supervisor: la unica diferencia con admin',
    usuario: SUPERVISOR,
    accion: 'crear_supervisor',
    esperado: false,
  },
  {
    descripcion: 'supervisor NO puede editar una fila de evento',
    usuario: SUPERVISOR,
    accion: 'editar_evento',
    esperado: false,
  },
  {
    descripcion: 'supervisor NO puede borrar una fila de evento',
    usuario: SUPERVISOR,
    accion: 'borrar_evento',
    esperado: false,
  },

  // --- chofer: puede (sobre sus propios recursos) ---
  {
    descripcion: 'chofer puede ver su propia asignacion',
    usuario: CHOFER,
    accion: 'ver_asignacion_propia',
    recurso: { choferId: CHOFER.id },
    esperado: true,
  },
  {
    descripcion: 'chofer puede insertar su propio evento',
    usuario: CHOFER,
    accion: 'insertar_evento_propio',
    recurso: { choferId: CHOFER.id },
    esperado: true,
  },
  {
    descripcion: 'chofer puede editar su propio perfil (telefono)',
    usuario: CHOFER,
    accion: 'editar_perfil_propio',
    recurso: { usuarioId: CHOFER.id },
    esperado: true,
  },
  // --- chofer: no puede ---
  {
    descripcion: 'chofer NO puede ver la asignacion de otro chofer',
    usuario: CHOFER,
    accion: 'ver_asignacion_propia',
    recurso: { choferId: OTRO_CHOFER_ID },
    esperado: false,
  },
  {
    descripcion: 'chofer NO puede ver el panel',
    usuario: CHOFER,
    accion: 'ver_panel',
    esperado: false,
  },
  {
    descripcion: 'chofer NO puede crear un usuario',
    usuario: CHOFER,
    accion: 'gestionar_usuarios',
    esperado: false,
  },
  {
    descripcion: 'chofer NO puede ver la bitacora',
    usuario: CHOFER,
    accion: 'ver_bitacora',
    esperado: false,
  },
  {
    descripcion: 'chofer NO puede crear un supervisor',
    usuario: CHOFER,
    accion: 'crear_supervisor',
    esperado: false,
  },
  {
    descripcion: 'chofer NO puede borrar una fila de evento',
    usuario: CHOFER,
    accion: 'borrar_evento',
    esperado: false,
  },
];

describe('can(): matriz de permisos de la §8', () => {
  it.each(CASOS)('$descripcion', ({ usuario, accion, recurso, esperado }) => {
    expect(can(usuario, accion, recurso)).toBe(esperado);
  });
});
