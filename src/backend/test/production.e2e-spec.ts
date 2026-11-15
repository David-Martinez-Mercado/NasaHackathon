import './env-production';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FakePrisma, codigo, crearApp, gql } from './helpers';

describe('Producción: sin introspección, sin Sandbox y sin detalles internos', () => {
  let app: INestApplication;
  let prisma: FakePrisma;

  beforeAll(async () => ({ app, prisma } = await crearApp()));
  afterAll(() => app.close());

  it('bloquea la introspección del esquema', async () => {
    const res = await gql(app, '{ __schema { queryType { name } } }');
    expect(res.body.data?.__schema).toBeUndefined();
    expect(res.body.errors).toBeDefined();
  });

  it('no sirve la página del Sandbox de Apollo', async () => {
    const res = await request(app.getHttpServer()).get('/graphql').set('Accept', 'text/html');
    expect(res.text).not.toMatch(/sandbox|embeddable/i);
  });

  it('un error interno no filtra su mensaje ni su traza', async () => {
    prisma.cultivo.findMany.mockRejectedValueOnce(new Error('password authentication failed for user "secreto"'));
    const res = await gql(app, '{ cultivos { id } }');
    expect(codigo(res)).toBe('ERROR_INTERNO');
    const texto = JSON.stringify(res.body);
    expect(texto).not.toMatch(/secreto|password|stacktrace|node_modules/i);
    expect(res.body.errors[0].message).toMatch(/inesperado/i);
  });

  it('los errores de validación siguen siendo claros para el usuario', async () => {
    const res = await gql(app, 'mutation($i: CrearParcelaInput!) { crearParcela(input: $i) { id } }', {
      i: { punto: { latitud: 95, longitud: 0 } },
    });
    expect(codigo(res)).toBe('VALIDACION_FALLIDA');
    expect(res.body.errors[0].message).toMatch(/latitud/i);
  });

  it('pone cabeceras de seguridad (helmet)', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
