import './env-int';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ImportacionService } from '../src/predicciones/importacion.service';
import { ValidadorExport } from '../src/predicciones/export-validator';
import { PrismaService } from '../src/prisma/prisma.service';
import { codigo, crearAppReal, ESQUEMA_EXPORT, EXPORT_V1, gql, POLIGONO, PUNTO, reiniciarBase } from './helpers-int';

describe('API general (base real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => ({ app, prisma } = await crearAppReal()));
  afterAll(() => app.close());
  beforeEach(() => reiniciarBase(prisma));

  describe('salud', () => {
    it('GET /health responde ok cuando la base de datos contesta', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body).toEqual({ estado: 'ok', baseDeDatos: true });
    });

    it('GET /health responde 503 si la base de datos no contesta', async () => {
      const espiar = jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('connection refused') as never);
      const res = await request(app.getHttpServer()).get('/health').expect(503);
      expect(res.body.estado).toBe('degradado');
      espiar.mockRestore();
    });

    it('salud: PostGIS real, y avisa lo que falta (motor, datos y predicciones) en vez de aparentar que está todo', async () => {
      const sin = await gql(app, '{ salud { estado entorno fuentes { nombre estado detalle } } }').expect(200);
      expect(sin.body.data.salud.estado).toBe('DEGRADADO');
      const fuentes = Object.fromEntries(sin.body.data.salud.fuentes.map((f: any) => [f.nombre, f]));
      expect(fuentes['base de datos'].estado).toBe('OK');
      expect(fuentes.PostGIS).toMatchObject({ estado: 'OK', detalle: expect.stringMatching(/^versión 3\./) });
      expect(fuentes['motor de reglas'].estado).toBe('NO_DISPONIBLE');
      expect(fuentes['predicciones de los modelos (ml/)']).toMatchObject({
        estado: 'NO_DISPONIBLE',
        detalle: expect.stringMatching(/import:predicciones/),
      });

      await app.get(ImportacionService).importar(EXPORT_V1, { validador: ValidadorExport.desdeArchivo(ESQUEMA_EXPORT) });
      const con = await gql(app, '{ salud { fuentes { nombre estado detalle } } }');
      const pred = con.body.data.salud.fuentes.find((f: any) => f.nombre.startsWith('predicciones'));
      expect(pred).toMatchObject({ estado: 'OK', detalle: expect.stringMatching(/versión v2, datos al 2026-/) });
    });

    it('cultivos: lista el catálogo', async () => {
      const res = await gql(app, '{ cultivos { codigo nombre familiaBotanica verificado } }').expect(200);
      expect(res.body.data.cultivos.map((c: any) => c.codigo)).toEqual(expect.arrayContaining(['maiz', 'frijol', 'barbecho']));
      expect(res.body.data.cultivos.every((c: any) => c.verificado === false)).toBe(true);
    });
  });

  describe('crearParcela: validación de entrada', () => {
    const MUTACION = `mutation($input: CrearParcelaInput!) { crearParcela(input: $input) { id latitud longitud geometria } }`;

    it('crea una parcela desde un punto o un polígono', async () => {
      const a = await gql(app, MUTACION, { input: { nombre: 'Punto', punto: PUNTO } });
      expect(a.body.data.crearParcela).toMatchObject({ latitud: 40.42, longitud: -104.71, geometria: { type: 'Point' } });
      const b = await gql(app, MUTACION, { input: { poligono: POLIGONO } });
      expect(b.body.data.crearParcela.geometria.type).toBe('Polygon');
      expect(b.body.data.crearParcela.latitud).toBeCloseTo(40.42, 4);
    });

    it('rechaza latitud fuera de rango, punto y polígono a la vez, ninguno, y polígonos mal formados', async () => {
      expect(codigo(await gql(app, MUTACION, { input: { punto: { latitud: 95, longitud: 0 } } }))).toBe('VALIDACION_FALLIDA');
      expect(codigo(await gql(app, MUTACION, { input: { punto: PUNTO, poligono: POLIGONO } }))).toBe('VALIDACION_FALLIDA');
      expect(codigo(await gql(app, MUTACION, { input: { nombre: 'x' } }))).toBe('VALIDACION_FALLIDA');
      const abierto = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0.5, 0.5]]] };
      expect(codigo(await gql(app, MUTACION, { input: { poligono: abierto } }))).toBe('GEOMETRIA_INVALIDA');
    });

    it('rechaza campos que no existen en el input', async () => {
      const res = await gql(app, MUTACION, { input: { punto: PUNTO, admin: true } });
      expect(res.body.errors).toBeDefined();
      expect(await prisma.parcela.count()).toBe(0);
    });
  });

  describe('recomendaciones y escenarios: el motor y los datos aún no existen y la API no inventa', () => {
    let id: string;
    const SIMULAR = `query($input: SimulacionInput!) { simularEscenario(input: $input) { anios } }`;
    const escenario = () => ({ parcelaId: id, escenario: { lluviaPct: -20, tempDeltaC: 2 } });

    beforeEach(async () => {
      const res = await gql(app, `mutation($input: CrearParcelaInput!) { crearParcela(input: $input) { id } }`, {
        input: { punto: PUNTO, preferencias: { sistemaRiego: 'TEMPORAL' } },
      });
      if (!res.body.data) throw new Error(JSON.stringify(res.body.errors));
      id = res.body.data.crearParcela.id;
    });

    it('sin datos de clima y suelo avisa FUENTE_NO_DISPONIBLE', async () => {
      expect(codigo(await gql(app, SIMULAR, { input: escenario() }))).toBe('FUENTE_NO_DISPONIBLE');
    });

    it('valida los rangos de los sliders', async () => {
      const lluvia = await gql(app, SIMULAR, { input: { parcelaId: id, escenario: { lluviaPct: 500, tempDeltaC: 0 } } });
      expect(codigo(lluvia)).toBe('VALIDACION_FALLIDA');
      const calor = await gql(app, SIMULAR, { input: { parcelaId: id, escenario: { lluviaPct: 0, tempDeltaC: 40 } } });
      expect(codigo(calor)).toBe('VALIDACION_FALLIDA');
    });

    it('pide guardar las preferencias antes de recomendar', async () => {
      await prisma.preferencias.deleteMany();
      const res = await gql(app, `{ recomendaciones(input: { parcelaId: "${id}" }) { anios } }`);
      expect(codigo(res)).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors[0].message).toMatch(/preferencias/i);
    });

    it('con datos pero sin motor responde NO_IMPLEMENTADO, y guardarEscenario no guarda nada', async () => {
      await prisma.$disconnect(); // PGlite atiende una sola conexión: la app principal la suelta mientras corre la segunda
      const { app: conDatos, prisma: bd } = await crearAppReal({ datos: true });
      try {
        const sim = await gql(conDatos, SIMULAR, { input: escenario() });
        if (codigo(sim) !== "NO_IMPLEMENTADO") throw new Error(JSON.stringify(sim.body.errors));
        expect(codigo(sim)).toBe("NO_IMPLEMENTADO");
        expect(sim.body.errors[0].message).toMatch(/motor/i);
        const guardar = await gql(
          conDatos,
          `mutation { guardarEscenario(input: { parcelaId: "${id}", lluviaPct: 10, tempDeltaC: 1 }) { id } }`,
        );
        expect(codigo(guardar)).toBe('NO_IMPLEMENTADO');
        expect(await bd.escenario.count()).toBe(0);
      } finally {
        await conDatos.close();
        await prisma.$connect();
      }
    });
  });

  describe('seguridad del servidor', () => {
    it('CORS: solo acepta el origen del frontend', async () => {
      const permitido = await request(app.getHttpServer())
        .options('/graphql').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
      expect(permitido.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      const ajeno = await request(app.getHttpServer())
        .options('/graphql').set('Origin', 'http://malo.example').set('Access-Control-Request-Method', 'POST');
      expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('CSRF de Apollo: rechaza un POST sin cabecera de preflight ni JSON', async () => {
      const res = await request(app.getHttpServer())
        .post('/graphql').set('Content-Type', 'text/plain').send('{"query":"{ cultivos { id } }"}');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});
