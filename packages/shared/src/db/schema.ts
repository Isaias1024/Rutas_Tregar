import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// FUENTE UNICA del esquema (§4). Doce tablas, seis enums.

// --- Referencia de solo lectura a auth.users ---------------------------------
// Drizzle solo administra el esquema `public` (drizzle.config.ts, schemaFilter).
// Esta declaracion existe unicamente para que `usuario.id` pueda referenciar la
// fila real que crea Supabase Auth; drizzle-kit jamas emite DDL para ella.
const authSchema = pgSchema('auth');
export const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
});

// --- Enums --------------------------------------------------------------------
export const rolEnum = pgEnum('rol', ['admin', 'supervisor', 'chofer']);
export const turnoEnum = pgEnum('turno', ['manana', 'tarde', 'noche']);
export const estadoCamionEnum = pgEnum('estado_camion', [
  'disponible',
  'asignado',
  'mantenimiento',
]);
export const tipoEventoEnum = pgEnum('tipo_evento', [
  'vio_ruta',
  'listo_inicio',
  'inicio_ruta',
  'fin_ruta',
  'fin_ruta_incidente',
  'retorno',
]);
export const tipoIncidenteEnum = pgEnum('tipo_incidente', [
  'emergencia_personal',
  'choque',
  'trafico',
  'otro',
]);
export const origenEventoEnum = pgEnum('origen_evento', ['app', 'supervisor']);
export const tipoNotificacionEnum = pgEnum('tipo_notificacion', [
  'asignacion_nueva',
  'modificacion_ruta_asignada',
  'recordatorio_inicio',
  'alerta_retraso',
]);

// --- cliente --------------------------------------------------------------
export const cliente = pgTable('cliente', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  activo: boolean('activo').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- camion -----------------------------------------------------------------
// Declarado antes de `usuario` porque `usuario.camion_id` lo referencia.
export const camion = pgTable('camion', {
  id: uuid('id').primaryKey().defaultRandom(),
  codigo: text('codigo').notNull().unique(),
  tipo: text('tipo').notNull(),
  placas: text('placas').notNull(),
  km: integer('km').notNull().default(0),
  estado: estadoCamionEnum('estado').notNull().default('disponible'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// --- usuario ------------------------------------------------------------------
// `id` ES `auth.users.id`: una sola identidad, no dos tablas que se sincronizan.
export const usuario = pgTable('usuario', {
  id: uuid('id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'restrict' }),
  credencial: text('credencial').notNull().unique(),
  rol: rolEnum('rol').notNull(),
  correo: text('correo').unique(),
  activo: boolean('activo').notNull().default(true),
  debeCambiarPassword: boolean('debe_cambiar_password').notNull().default(true),
  camionId: uuid('camion_id').references(() => camion.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// --- perfil_personal ----------------------------------------------------------
// Tabla separada a proposito: la baja vacia esta tabla y conserva `usuario`.
export const perfilPersonal = pgTable('perfil_personal', {
  usuarioId: uuid('usuario_id')
    .primaryKey()
    .references(() => usuario.id, { onDelete: 'cascade' }),
  nombre: text('nombre').notNull(),
  correo: text('correo'),
  telefono: text('telefono'),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
});

// --- parada ---------------------------------------------------------------
export const parada = pgTable('parada', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  direccion: text('direccion').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// --- ruta -----------------------------------------------------------------
// La plantilla del trayecto: cliente, nombre y las dos paradas. Turno, horas
// esperadas y cupo viven en `horario`.
export const ruta = pgTable('ruta', {
  id: uuid('id').primaryKey().defaultRandom(),
  clienteId: uuid('cliente_id')
    .notNull()
    .references(() => cliente.id, { onDelete: 'restrict' }),
  nombre: text('nombre').notNull(),
  paradaInicioId: uuid('parada_inicio_id')
    .notNull()
    .references(() => parada.id, { onDelete: 'restrict' }),
  paradaFinId: uuid('parada_fin_id')
    .notNull()
    .references(() => parada.id, { onDelete: 'restrict' }),
  activa: boolean('activa').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// --- horario ----------------------------------------------------------------
// Una salida programada de una ruta. Una ruta puede tener varios horarios,
// incluso dentro del mismo turno (la ruta 10 a las 06:00 y otra vez a las
// 08:00, ambas en `manana`, cada una con su propio chofer via `asignacion`).
export const horario = pgTable(
  'horario',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rutaId: uuid('ruta_id')
      .notNull()
      .references(() => ruta.id, { onDelete: 'restrict' }),
    turno: turnoEnum('turno').notNull(),
    horaInicioEsperada: time('hora_inicio_esperada').notNull(),
    horaFinEsperada: time('hora_fin_esperada').notNull(),
    personasEsperadas: integer('personas_esperadas').notNull(),
    activo: boolean('activo').notNull().default(true),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('horario_ruta_id_idx').on(t.rutaId)],
);

// --- asignacion -----------------------------------------------------------
// Una ejecucion concreta de un horario, un dia, por un chofer, en un camion.
export const asignacion = pgTable(
  'asignacion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    horarioId: uuid('horario_id')
      .notNull()
      .references(() => horario.id, { onDelete: 'restrict' }),
    fecha: date('fecha').notNull(),
    secuencia: integer('secuencia').notNull().default(1),
    choferId: uuid('chofer_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'restrict' }),
    camionId: uuid('camion_id')
      .notNull()
      .references(() => camion.id, { onDelete: 'restrict' }),
    camionCodigo: text('camion_codigo').notNull(),
    cntAbordaron: integer('cnt_abordaron'),
    cntRetornaron: integer('cnt_retornaron'),
    canceladaEn: timestamp('cancelada_en', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => usuario.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Por horario, no por ruta: es lo que permite que dos horarios de la
    // misma ruta y el mismo turno se asignen el mismo dia sin chocar.
    unique('asignacion_horario_fecha_secuencia_key').on(t.horarioId, t.fecha, t.secuencia),
    index('asignacion_fecha_horario_id_idx').on(t.fecha, t.horarioId),
    index('asignacion_chofer_id_fecha_idx').on(t.choferId, t.fecha),
  ],
);

// --- evento -----------------------------------------------------------------
// El hito marcado. Append-only: jamas un UPDATE, jamas un DELETE (impuesto por
// RLS en rls.sql, no solo por convencion).
export const evento = pgTable(
  'evento',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    asignacionId: uuid('asignacion_id')
      .notNull()
      .references(() => asignacion.id, { onDelete: 'restrict' }),
    tipo: tipoEventoEnum('tipo').notNull(),
    ocurrioEn: timestamp('ocurrio_en', { withTimezone: true }).notNull(),
    recibidoEn: timestamp('recibido_en', { withTimezone: true }).notNull().defaultNow(),
    monotonicMs: bigint('monotonic_ms', { mode: 'number' }),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    gpsPrecisionM: doublePrecision('gps_precision_m'),
    sinGps: boolean('sin_gps').notNull().default(false),
    origen: origenEventoEnum('origen').notNull(),
    capturadoPor: uuid('capturado_por')
      .notNull()
      .references(() => usuario.id),
    clientEventId: uuid('client_event_id').notNull().unique(),
    razonIncidente: tipoIncidenteEnum('razon_incidente'),
  },
  (t) => [
    unique('evento_asignacion_tipo_key').on(t.asignacionId, t.tipo),
    index('evento_recibido_en_idx').on(t.recibidoEn),
  ],
);

// --- dispositivo --------------------------------------------------------------
// El telefono registrado para push. Re-registrar reemplaza, no duplica.
export const dispositivo = pgTable(
  'dispositivo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    expoPushToken: text('expo_push_token').notNull().unique(),
    plataforma: text('plataforma').notNull(),
    appVersion: text('app_version').notNull(),
    ultimaVez: timestamp('ultima_vez', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('dispositivo_usuario_id_token_key').on(t.usuarioId, t.expoPushToken)],
);

// --- notificacion_programada ---------------------------------------------
// La cola del worker. `enviado_en` se marca ANTES de enviar: un reinicio no
// duplica.
export const notificacionProgramada = pgTable(
  'notificacion_programada',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    asignacionId: uuid('asignacion_id')
      .notNull()
      .references(() => asignacion.id, { onDelete: 'cascade' }),
    tipo: tipoNotificacionEnum('tipo').notNull(),
    enviarEn: timestamp('enviar_en', { withTimezone: true }).notNull(),
    enviadoEn: timestamp('enviado_en', { withTimezone: true }),
    error: text('error'),
  },
  (t) => [
    uniqueIndex('notificacion_programada_pendiente_key')
      .on(t.asignacionId, t.tipo)
      .where(sql`${t.enviadoEn} is null`),
    index('notificacion_programada_enviar_en_idx')
      .on(t.enviarEn)
      .where(sql`${t.enviadoEn} is null`),
  ],
);

// --- audit_log ------------------------------------------------------------
// Append-only, escrito en la misma transaccion que la mutacion que registra.
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => usuario.id),
    accion: text('accion').notNull(),
    recursoTipo: text('recurso_tipo').notNull(),
    recursoId: text('recurso_id').notNull(),
    antes: jsonb('antes'),
    despues: jsonb('despues'),
    ip: inet('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_recurso_idx').on(t.recursoTipo, t.recursoId, t.createdAt.desc())],
);
