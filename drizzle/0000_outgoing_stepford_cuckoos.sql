CREATE TYPE "public"."estado_camion" AS ENUM('disponible', 'asignado', 'mantenimiento');--> statement-breakpoint
CREATE TYPE "public"."origen_evento" AS ENUM('app', 'supervisor');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('admin', 'supervisor', 'chofer');--> statement-breakpoint
CREATE TYPE "public"."tipo_evento" AS ENUM('vio_ruta', 'listo_inicio', 'inicio_ruta', 'fin_ruta', 'retorno');--> statement-breakpoint
CREATE TYPE "public"."tipo_notificacion" AS ENUM('asignacion_nueva', 'modificacion_ruta_asignada', 'recordatorio_inicio', 'alerta_retraso');--> statement-breakpoint
CREATE TYPE "public"."turno" AS ENUM('manana', 'tarde', 'noche');--> statement-breakpoint
CREATE TABLE "asignacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"horario_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"secuencia" integer DEFAULT 1 NOT NULL,
	"chofer_id" uuid NOT NULL,
	"camion_id" uuid NOT NULL,
	"camion_codigo" text NOT NULL,
	"cnt_abordaron" integer,
	"cnt_retornaron" integer,
	"cancelada_en" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asignacion_horario_fecha_secuencia_key" UNIQUE("horario_id","fecha","secuencia")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"accion" text NOT NULL,
	"recurso_tipo" text NOT NULL,
	"recurso_id" text NOT NULL,
	"antes" jsonb,
	"despues" jsonb,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- "auth"."users" NO se crea aqui: ya existe, la crea Supabase Auth (GoTrue).
-- Se declara en schema.ts unicamente para que `usuario.id` la pueda
-- referenciar por FK con seguridad de tipos; el CREATE TABLE que drizzle-kit
-- generaria para ella se elimino a mano de esta migracion, una sola vez,
-- antes de correrla. Es la excepcion documentada a "nunca edites una
-- migracion a mano": esta migracion todavia no habia corrido.
CREATE TABLE "camion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"tipo" text NOT NULL,
	"placas" text NOT NULL,
	"km" integer DEFAULT 0 NOT NULL,
	"estado" "estado_camion" DEFAULT 'disponible' NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "camion_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispositivo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expo_push_token" text NOT NULL,
	"plataforma" text NOT NULL,
	"app_version" text NOT NULL,
	"ultima_vez" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispositivo_expo_push_token_unique" UNIQUE("expo_push_token"),
	CONSTRAINT "dispositivo_usuario_id_token_key" UNIQUE("usuario_id","expo_push_token")
);
--> statement-breakpoint
CREATE TABLE "evento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asignacion_id" uuid NOT NULL,
	"tipo" "tipo_evento" NOT NULL,
	"ocurrio_en" timestamp with time zone NOT NULL,
	"recibido_en" timestamp with time zone DEFAULT now() NOT NULL,
	"monotonic_ms" bigint,
	"lat" double precision,
	"lng" double precision,
	"gps_precision_m" double precision,
	"sin_gps" boolean DEFAULT false NOT NULL,
	"origen" "origen_evento" NOT NULL,
	"capturado_por" uuid NOT NULL,
	"client_event_id" uuid NOT NULL,
	CONSTRAINT "evento_client_event_id_unique" UNIQUE("client_event_id"),
	CONSTRAINT "evento_asignacion_tipo_key" UNIQUE("asignacion_id","tipo")
);
--> statement-breakpoint
CREATE TABLE "horario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ruta_id" uuid NOT NULL,
	"turno" "turno" NOT NULL,
	"hora_inicio_esperada" time NOT NULL,
	"hora_fin_esperada" time NOT NULL,
	"personas_esperadas" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notificacion_programada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asignacion_id" uuid NOT NULL,
	"tipo" "tipo_notificacion" NOT NULL,
	"enviar_en" timestamp with time zone NOT NULL,
	"enviado_en" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "parada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"direccion" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perfil_personal" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"correo" text,
	"telefono" text,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ruta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"parada_inicio_id" uuid NOT NULL,
	"parada_fin_id" uuid NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" uuid PRIMARY KEY NOT NULL,
	"credencial" text NOT NULL,
	"rol" "rol" NOT NULL,
	"correo" text,
	"activo" boolean DEFAULT true NOT NULL,
	"debe_cambiar_password" boolean DEFAULT true NOT NULL,
	"camion_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "usuario_credencial_unique" UNIQUE("credencial"),
	CONSTRAINT "usuario_correo_unique" UNIQUE("correo")
);
--> statement-breakpoint
ALTER TABLE "asignacion" ADD CONSTRAINT "asignacion_horario_id_horario_id_fk" FOREIGN KEY ("horario_id") REFERENCES "public"."horario"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asignacion" ADD CONSTRAINT "asignacion_chofer_id_usuario_id_fk" FOREIGN KEY ("chofer_id") REFERENCES "public"."usuario"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asignacion" ADD CONSTRAINT "asignacion_camion_id_camion_id_fk" FOREIGN KEY ("camion_id") REFERENCES "public"."camion"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asignacion" ADD CONSTRAINT "asignacion_created_by_usuario_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_usuario_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivo" ADD CONSTRAINT "dispositivo_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento" ADD CONSTRAINT "evento_asignacion_id_asignacion_id_fk" FOREIGN KEY ("asignacion_id") REFERENCES "public"."asignacion"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento" ADD CONSTRAINT "evento_capturado_por_usuario_id_fk" FOREIGN KEY ("capturado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horario" ADD CONSTRAINT "horario_ruta_id_ruta_id_fk" FOREIGN KEY ("ruta_id") REFERENCES "public"."ruta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacion_programada" ADD CONSTRAINT "notificacion_programada_asignacion_id_asignacion_id_fk" FOREIGN KEY ("asignacion_id") REFERENCES "public"."asignacion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil_personal" ADD CONSTRAINT "perfil_personal_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruta" ADD CONSTRAINT "ruta_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruta" ADD CONSTRAINT "ruta_parada_inicio_id_parada_id_fk" FOREIGN KEY ("parada_inicio_id") REFERENCES "public"."parada"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruta" ADD CONSTRAINT "ruta_parada_fin_id_parada_id_fk" FOREIGN KEY ("parada_fin_id") REFERENCES "public"."parada"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_camion_id_camion_id_fk" FOREIGN KEY ("camion_id") REFERENCES "public"."camion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asignacion_fecha_horario_id_idx" ON "asignacion" USING btree ("fecha","horario_id");--> statement-breakpoint
CREATE INDEX "asignacion_chofer_id_fecha_idx" ON "asignacion" USING btree ("chofer_id","fecha");--> statement-breakpoint
CREATE INDEX "audit_log_recurso_idx" ON "audit_log" USING btree ("recurso_tipo","recurso_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "evento_recibido_en_idx" ON "evento" USING btree ("recibido_en");--> statement-breakpoint
CREATE INDEX "horario_ruta_id_idx" ON "horario" USING btree ("ruta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notificacion_programada_pendiente_key" ON "notificacion_programada" USING btree ("asignacion_id","tipo") WHERE "notificacion_programada"."enviado_en" is null;--> statement-breakpoint
CREATE INDEX "notificacion_programada_enviar_en_idx" ON "notificacion_programada" USING btree ("enviar_en") WHERE "notificacion_programada"."enviado_en" is null;