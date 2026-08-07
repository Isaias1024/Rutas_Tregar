import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { crearApp } from './servidor.ts';

const SECRETO = 'secreto-de-prueba-1234567890';
const logger = pino({ enabled: false });

interface CuerpoRespuesta {
  codigo?: string;
  mensaje?: string;
}

describe('GET /salud', () => {
  it('responde 200 con db: "ok" cuando la base responde', async () => {
    const app = crearApp({ secreto: SECRETO, logger, verificarSalud: async () => true });
    const respuesta = await app.request('/salud');
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ db: 'ok' });
  });

  it('responde 503 con db: "caida" cuando la base no responde', async () => {
    const app = crearApp({ secreto: SECRETO, logger, verificarSalud: async () => false });
    const respuesta = await app.request('/salud');
    expect(respuesta.status).toBe(503);
    expect(await respuesta.json()).toEqual({ db: 'caida' });
  });
});

describe('POST /reportes/pdf', () => {
  it('responde 401 con codigo secreto_invalido sin el header', async () => {
    const app = crearApp({ secreto: SECRETO, logger, verificarSalud: async () => true });
    const respuesta = await app.request('/reportes/pdf', { method: 'POST' });
    expect(respuesta.status).toBe(401);
    const cuerpo = (await respuesta.json()) as CuerpoRespuesta;
    expect(cuerpo.codigo).toBe('secreto_invalido');
  });

  it('responde 401 con un secreto incorrecto', async () => {
    const app = crearApp({ secreto: SECRETO, logger, verificarSalud: async () => true });
    const respuesta = await app.request('/reportes/pdf', {
      method: 'POST',
      headers: { 'x-rutas-worker-secret': 'otro-secreto-cualquiera' },
    });
    expect(respuesta.status).toBe(401);
    const cuerpo = (await respuesta.json()) as CuerpoRespuesta;
    expect(cuerpo.codigo).toBe('secreto_invalido');
    // No revela en que caracter difirio: el mensaje es generico.
    expect(cuerpo.mensaje).not.toMatch(/caracter|posicion/i);
  });

  it('responde 200 con el secreto correcto', async () => {
    const app = crearApp({ secreto: SECRETO, logger, verificarSalud: async () => true });
    const respuesta = await app.request('/reportes/pdf', {
      method: 'POST',
      headers: { 'x-rutas-worker-secret': SECRETO },
    });
    expect(respuesta.status).toBe(200);
  });

  it('responde 429 con codigo limite_excedido despues de 30 peticiones en un minuto', async () => {
    const app = crearApp({ secreto: SECRETO, logger, verificarSalud: async () => true });
    const headers = { 'x-rutas-worker-secret': SECRETO };

    for (let i = 0; i < 30; i++) {
      const respuesta = await app.request('/reportes/pdf', { method: 'POST', headers });
      expect(respuesta.status).toBe(200);
    }

    const respuesta31 = await app.request('/reportes/pdf', { method: 'POST', headers });
    expect(respuesta31.status).toBe(429);
    const cuerpo = (await respuesta31.json()) as CuerpoRespuesta;
    expect(cuerpo.codigo).toBe('limite_excedido');
  });

  it('el limite de tasa es independiente por secreto', async () => {
    // Simula dos secretos "correctos" con dos apps distintas: agotar el
    // limite de una no debe afectar a la otra.
    const app = crearApp({ secreto: SECRETO, logger, verificarSalud: async () => true });
    const headers = { 'x-rutas-worker-secret': SECRETO };
    for (let i = 0; i < 30; i++) {
      await app.request('/reportes/pdf', { method: 'POST', headers });
    }
    const agotado = await app.request('/reportes/pdf', { method: 'POST', headers });
    expect(agotado.status).toBe(429);

    const otraApp = crearApp({ secreto: SECRETO, logger, verificarSalud: async () => true });
    const fresca = await otraApp.request('/reportes/pdf', { method: 'POST', headers });
    expect(fresca.status).toBe(200);
  });
});
