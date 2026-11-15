import { validateEnv } from './env';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('validateEnv', () => {
  it('aplica valores por defecto seguros', () => {
    const env = validateEnv({ ...base });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.DEMO_OFFLINE).toBe(true);
    expect(env.GRAPHQL_MAX_DEPTH).toBe(6);
    expect(env.isProduction).toBe(false);
    expect(env.corsOrigins).toEqual([]);
  });

  it('convierte números y booleanos que llegan como texto', () => {
    const env = validateEnv({ ...base, PORT: '8080', DEMO_OFFLINE: 'false', THROTTLE_LIMIT: '50', TRUST_PROXY: '1' });
    expect(env.PORT).toBe(8080);
    expect(env.DEMO_OFFLINE).toBe(false);
    expect(env.THROTTLE_LIMIT).toBe(50);
    expect(env.TRUST_PROXY).toBe(1);
  });

  it('separa los orígenes de CORS', () => {
    const env = validateEnv({ ...base, CORS_ORIGIN: 'https://a.com, https://b.com ,' });
    expect(env.corsOrigins).toEqual(['https://a.com', 'https://b.com']);
  });

  it('falla con un mensaje claro si falta DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it.each([
    ['NODE_ENV desconocido', { NODE_ENV: 'staging' }],
    ['puerto fuera de rango', { PORT: '70000' }],
    ['profundidad demasiado alta', { GRAPHQL_MAX_DEPTH: '50' }],
    ['límite en cero', { THROTTLE_LIMIT: '0' }],
  ])('rechaza %s', (_nombre, extra) => {
    expect(() => validateEnv({ ...base, ...extra })).toThrow(/Configuración inválida/);
  });
});
