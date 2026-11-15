import './env-limits';
import { INestApplication } from '@nestjs/common';
import { PARCELA_ID, codigo, crearApp, gql } from './helpers';

describe('Protección de la API: profundidad, complejidad y rate limiting', () => {
  let app: INestApplication;

  beforeAll(async () => ({ app } = await crearApp(undefined, { datos: true })));
  afterAll(() => app.close());

  it('rechaza consultas más profundas que GRAPHQL_MAX_DEPTH', async () => {
    const res = await gql(app, `{ escenarios(parcelaId: "${PARCELA_ID}") { resultado { puntajes { agua } } } }`);
    expect(codigo(res)).toBe('CONSULTA_DEMASIADO_COMPLEJA');
    expect(res.body.data).toBeUndefined();
  });

  it('rechaza consultas que cuestan más que GRAPHQL_MAX_COMPLEXITY', async () => {
    const campos = 'id codigo nombre';
    const res = await gql(app, `{ a: cultivos { ${campos} } b: cultivos { ${campos} } c: cultivos { ${campos} } }`);
    expect(codigo(res)).toBe('CONSULTA_DEMASIADO_COMPLEJA');
    expect(res.body.errors[0].message).toMatch(/demasiado pesada/);
  });

  it('acepta una consulta dentro de los límites', async () => {
    const res = await gql(app, '{ cultivos { id codigo } }').expect(200);
    expect(res.body.errors).toBeUndefined();
  });

  it('las operaciones costosas tienen un límite más estricto', async () => {
    const consulta = `{ simularEscenario(input: { parcelaId: "${PARCELA_ID}", escenario: { lluviaPct: 0, tempDeltaC: 0 } }) { anios } }`;
    const resultados = [];
    for (let i = 0; i < 3; i++) resultados.push(codigo(await gql(app, consulta)));
    expect(resultados[0]).toBe('NO_IMPLEMENTADO'); // llegó al motor
    expect(resultados[1]).toBe('NO_IMPLEMENTADO');
    expect(resultados[2]).toBe('LIMITE_EXCEDIDO'); // la tercera ya no pasa
  });

  it('el límite general es más amplio y /health no cuenta', async () => {
    const codigos = [];
    for (let i = 0; i < 6; i++) codigos.push(codigo(await gql(app, '{ salud { estado } }')));
    expect(codigos.slice(0, 5).every((c) => c === undefined)).toBe(true);
    expect(codigos[5]).toBe('LIMITE_EXCEDIDO');
  });
});
