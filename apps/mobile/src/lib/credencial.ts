// Sintesis deterministica del correo interno que exige Supabase Auth: el chofer
// solo teclea credencial, y este es el unico lugar que sabe construirlo.
export function correoDesdeCredencial(credencial: string): string {
  return `${credencial.trim().toLowerCase()}@choferes.rutas.local`;
}
