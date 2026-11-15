import './env-test';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PARCELA_ID, FakePrisma, codigo, crearApp, gql, sqlText } from './helpers';

describe('API GraphQL (sin base de datos real)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;

  beforeAll(async () => ({ app, prisma } = await crearApp()));
  afterAll(() => app.close());

  it('GET /health responde ok cuando la base de datos contesta', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ estado: 'ok', baseDeDatos: true });
  });

  it('GET /health responde 503 si la base de datos no contesta', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app.getHttpServer()).get('/health').expect(503);
    expect(res.body.estado).toBe('degradado');
  });

  it('salud: reporta DEGRADADO mientras el motor y los datos no estén conectados', async () => {
    const res = await gql(app, '{ salud { estado entorno demoOffline fuentes { nombre estado } } }').expect(200);
    expect(res.body.data.salud.estado).toBe('DEGRADADO');
    const fuentes = Object.fromEntries(res.body.data.salud.fuentes.map((f: any) => [f.nombre, f.estado]));
    expect(fuentes).toMatchObject({ 'base de datos': 'OK', PostGIS: 'OK', 'motor de reglas': 'NO_DISPONIBLE' });
  });

  it('cultivos: lista el catálogo', async () => {
    const res = await gql(app, '{ cultivos { codigo nombre familiaBotanica verificado } }').expect(200);
    expect(res.body.data.cultivos).toHaveLength(2);
    expect(res.body.data.cultivos[0]).toMatchObject({ codigo: 'frijol', verificado: false });
  });

  describe('crearParcela', () => {
    const MUTACION = `mutation($input: CrearParcelaInput!) { crearParcela(input: $input) { id latitud longitud geometria creadaEn } }`;

    it('crea una parcela desde un punto y manda el SQL parametrizado', async () => {
      const res = await gql(app, MUTACION, { input: { nombre: 'Mi parcela', punto: { latitud: 40.42, longitud: -104.71 } } }).expect(200);
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.crearParcela).toMatchObject({ id: PARCELA_ID, latitud: 40.42, longitud: -104.71 });
      expect(res.body.data.crearParcela.geometria).toEqual({ type: 'Point', coordinates: [-104.71, 40.42] });

      const llamada = prisma.$queryRaw.mock.calls.find(([arg]) => sqlText(arg).includes('INSERT INTO "Parcela"'))!;
      const sql = llamada[0] as { values: unknown[] };
      expect(sql.values).toContain('Mi parcela'); // el valor viaja como parámetro...
      expect(sqlText(sql)).not.toContain('Mi parcela'); // ...y nunca dentro del texto del SQL
      expect(sql.values).toContain(JSON.stringify({ type: 'Point', coordinates: [-104.71, 40.42] }));
    });

    it('rechaza una latitud fuera de rango', async () => {
      const res = await gql(app, MUTACION, { input: { punto: { latitud: 95, longitud: 0 } } });
      expect(codigo(res)).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors[0].message).toMatch(/latitud/i);
    });

    it('rechaza punto y polígono a la vez, o ninguno', async () => {
      const poligono = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
      const ambos = await gql(app, MUTACION, { input: { punto: { latitud: 1, longitud: 1 }, poligono } });
      expect(codigo(ambos)).toBe('VALIDACION_FALLIDA');
      const ninguno = await gql(app, MUTACION, { input: { nombre: 'x' } });
      expect(codigo(ninguno)).toBe('VALIDACION_FALLIDA');
    });

    it('rechaza un polígono que no cierra', async () => {
      const poligono = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0.5, 0.5]]] };
      const res = await gql(app, MUTACION, { input: { poligono } });
      expect(codigo(res)).toBe('GEOMETRIA_INVALIDA');
    });

    it('rechaza campos que no existen en el input', async () => {
      const res = await gql(app, MUTACION, { input: { punto: { latitud: 1, longitud: 1 }, admin: true } });
      expect(res.body.errors).toBeDefined();
      expect(prisma.$queryRaw.mock.calls.filter(([a]) => sqlText(a).includes('INSERT'))).toHaveLength(1); // solo el caso válido de arriba
    });
  });

  describe('parcela y preferencias', () => {
    it('parcela: rechaza un id que no es UUID', async () => {
      const res = await gql(app, '{ parcela(id: "no-es-uuid") { id } }');
      expect(codigo(res)).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors[0].message).toBe('El identificador no es válido.');
    });

    it('parcela: devuelve la parcela con sus preferencias', async () => {
      const res = await gql(app, `{ parcela(id: "${PARCELA_ID}") { nombre preferencias { riego aguaRiegoMm prioridad } } }`).expect(200);
      expect(res.body.data.parcela).toEqual({
        nombre: 'Greeley (riego)',
        preferencias: { riego: true, aguaRiegoMm: 400, prioridad: 'BALANCE' },
      });
    });

    const GUARDAR = `mutation($id: ID!, $input: PreferenciasInput!) { guardarPreferencias(parcelaId: $id, input: $input) { riego prioridad cultivosPreferidos } }`;

    it('guardarPreferencias: guarda con cultivos conocidos', async () => {
      const res = await gql(app, GUARDAR, { id: PARCELA_ID, input: { riego: false, prioridad: 'AGUA', cultivosPreferidos: ['frijol'] } }).expect(200);
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.guardarPreferencias).toMatchObject({ riego: false, prioridad: 'AGUA', cultivosPreferidos: ['frijol'] });
    });

    it('guardarPreferencias: rechaza cultivos que no existen y repetidos', async () => {
      const desconocido = await gql(app, GUARDAR, { id: PARCELA_ID, input: { riego: true, cultivosPreferidos: ['unicornio'] } });
      expect(codigo(desconocido)).toBe('VALIDACION_FALLIDA');
      expect(desconocido.body.errors[0].message).toContain('unicornio');
      const repetido = await gql(app, GUARDAR, { id: PARCELA_ID, input: { riego: true, cultivosPreferidos: ['maiz'], cultivosExcluidos: ['maiz'] } });
      expect(codigo(repetido)).toBe('VALIDACION_FALLIDA');
    });
  });

  describe('recomendaciones y escenarios (datos y motor aún no conectados)', () => {
    const SIMULAR = `query($input: SimulacionInput!) { simularEscenario(input: $input) { anios } }`;
    const ESCENARIO = { parcelaId: PARCELA_ID, escenario: { lluviaPct: -20, tempDeltaC: 2 } };

    it('simularEscenario: avisa que no hay datos de clima y suelo en vez de inventarlos', async () => {
      const res = await gql(app, SIMULAR, { input: ESCENARIO });
      expect(codigo(res)).toBe('FUENTE_NO_DISPONIBLE');
    });

    it('simularEscenario: valida los rangos de los sliders', async () => {
      const lluvia = await gql(app, SIMULAR, { input: { parcelaId: PARCELA_ID, escenario: { lluviaPct: 500, tempDeltaC: 0 } } });
      expect(codigo(lluvia)).toBe('VALIDACION_FALLIDA');
      const calor = await gql(app, SIMULAR, { input: { parcelaId: PARCELA_ID, escenario: { lluviaPct: 0, tempDeltaC: 40 } } });
      expect(codigo(calor)).toBe('VALIDACION_FALLIDA');
    });

    it('recomendaciones: pide guardar preferencias antes', async () => {
      prisma.preferencias.findUnique.mockResolvedValueOnce(null as never);
      const res = await gql(app, `{ recomendaciones(input: { parcelaId: "${PARCELA_ID}" }) { anios } }`);
      expect(codigo(res)).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors[0].message).toMatch(/preferencias/i);
    });

    it('con datos pero sin motor: NO_IMPLEMENTADO, y guardarEscenario no guarda nada', async () => {
      const { app: conDatos, prisma: bd } = await crearApp(undefined, { datos: true });
      try {
        const sim = await gql(conDatos, SIMULAR, { input: ESCENARIO });
        expect(codigo(sim)).toBe('NO_IMPLEMENTADO');
        expect(sim.body.errors[0].message).toMatch(/motor/i);
        const guardar = await gql(conDatos, `mutation { guardarEscenario(input: { parcelaId: "${PARCELA_ID}", lluviaPct: 10, tempDeltaC: 1 }) { id } }`);
        expect(codigo(guardar)).toBe('NO_IMPLEMENTADO');
        expect(bd.escenario.create).not.toHaveBeenCalled();
      } finally {
        await conDatos.close();
      }
    });
  });

  it('CORS: solo acepta el origen del frontend', async () => {
    const permitido = await request(app.getHttpServer()).options('/graphql').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
    expect(permitido.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const ajeno = await request(app.getHttpServer()).options('/graphql').set('Origin', 'http://malo.example').set('Access-Control-Request-Method', 'POST');
    expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('CSRF de Apollo: rechaza un POST sin cabecera de preflight ni JSON', async () => {
    const res = await request(app.getHttpServer()).post('/graphql').set('Content-Type', 'text/plain').send('{"query":"{ cultivos { id } }"}');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
