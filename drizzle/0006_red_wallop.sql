CREATE TYPE "public"."tipo_incidente" AS ENUM('emergencia_personal', 'choque', 'trafico', 'otro');--> statement-breakpoint
ALTER TYPE "public"."tipo_evento" ADD VALUE 'fin_ruta_incidente' BEFORE 'retorno';--> statement-breakpoint
ALTER TABLE "evento" ADD COLUMN "razon_incidente" "tipo_incidente";