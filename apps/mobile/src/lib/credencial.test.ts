import { correoDesdeCredencial } from './credencial';

describe('correoDesdeCredencial', () => {
  it('sintetiza el correo determinista a partir de la credencial', () => {
    expect(correoDesdeCredencial('jperez')).toBe('jperez@choferes.rutas.local');
  });

  it('normaliza mayusculas y espacios sobrantes', () => {
    expect(correoDesdeCredencial('  JPerez  ')).toBe('jperez@choferes.rutas.local');
  });

  it('es determinista: la misma credencial siempre produce el mismo correo', () => {
    expect(correoDesdeCredencial('mgarcia')).toBe(correoDesdeCredencial('mgarcia'));
  });
});
