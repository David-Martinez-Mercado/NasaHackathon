import './env-int';
import './env-ml-vivo';
import { INestApplication } from '@nestjs/common';
import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { MlVivoCliente, validarRespuesta } from '../src/ml-vivo/ml-vivo.cliente';
import { ImportacionService } from '../src/predicciones/importacion.service';
import { ValidadorExport } from '../src/predicciones/export-validator';
import { PrismaService } from '../src/prisma/prisma.service';
import { codigo, crearAppReal, ESQUEMA_EXPORT, EXPORT_V1, gql, PUNTO, reiniciarBase } from './helpers-int';

type Modo = 'ok' | 'lento' | 'error500' | 'sin-permiso' | 'fuera-de-zona' | 'basura';

const respuestaOk = (lat: number, lon: number, cuerpo: any) => ({
  lat, lon, site_used: 'greeley-riego', site_distance_km: 0, generated_at: new Date().toISOString(), latency_ms: 41.5,
  data: { last_date: '2026-11-12', age_days: 3, fetched_at: new Date().toISOString(), from_cache: true, stale: false, cell_lat: 40.5, cell_lon: -105, observations: {} },
  results: [
    { concept: 'c05b', title: 'Riesgo de ola de calor', unit: '%', horizon: 'próximos 7 días', available: false, value: null, series: null, as_of: null, role: 'modelo', algorithm: 'Regresión logística', scenario_applied: false, notes: [], reason: 'El modelo de olas de calor solo se usa de mayo a septiembre (último dato: 2026-11-12).' },
    { concept: 'c08a', title: 'Probabilidad de lluvia mañana', unit: '%', horizon: 'mañana', available: true, value: cuerpo.scenario ? 9.4 : 5.5, series: null, as_of: '2026-11-12', role: 'modelo', algorithm: 'CatBoost', scenario_applied: !!cuerpo.scenario, notes: ['n'], reason: null },
    { concept: 'c08b', title: 'Lluvia mensual esperada', unit: 'mm', horizon: 'próximos 6 meses', available: true, value: 25, series: [25, 21.1, 20.4, 22.1, 37.8, 50.7], as_of: '2026-10-01', role: 'regla-base', algorithm: 'Climatología', scenario_applied: false, notes: [], reason: null },
  ],
  warnings: ['Los modelos se entrenaron con 2 puntos de Weld.'],
});

describe('Predicciones en vivo (servicio de ml/ simulado)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: Server;
  let modo: Modo = 'ok';
  const visto: { ruta: string; token?: string; cuerpo?: any }[] = [];
  let id: string;

  const leer = (req: IncomingMessage) =>
    new Promise<string>((resolver) => {
      let datos = '';
      req.on('data', (c) => (datos += c));
      req.on('end', () => resolver(datos));
    });

  beforeAll(async () => {
    servidor = createServer(async (req, res) => {
      const texto = await leer(req);
      const cuerpo = texto ? JSON.parse(texto) : undefined;
      visto.push({ ruta: `${req.method} ${req.url}`, token: req.headers['x-ml-token'] as string | undefined, cuerpo });
      const enviar = (estado: number, json: unknown) => {
        res.writeHead(estado, { 'content-type': 'application/json' });
        res.end(typeof json === 'string' ? json : JSON.stringify(json));
      };
      if (req.url === '/health') return enviar(modo === 'error500' ? 503 : 200, { estado: 'ok', modelos: ['c04', 'c05b', 'c08a', 'c08b'] });
      if (modo === 'lento') return setTimeout(() => enviar(200, respuestaOk(0, 0, cuerpo)), 1500);
      if (modo === 'error500') return enviar(500, { detail: 'boom' });
      if (modo === 'sin-permiso') return enviar(401, { detail: 'Token inválido' });
      if (modo === 'fuera-de-zona') return enviar(422, { detail: 'Fuera de la zona de entrenamiento (condado de Weld, Colorado y sus alrededores): no se predice.' });
      if (modo === 'basura') return enviar(200, { results: 'no es una lista' });
      return enviar(200, respuestaOk(cuerpo.lat, cuerpo.lon, cuerpo));
    });
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
    process.env.ML_SERVICE_URL = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    ({ app, prisma } = await crearAppReal());
    await reiniciarBase(prisma);
    await app.get(ImportacionService).importar(EXPORT_V1, { validador: ValidadorExport.desdeArchivo(ESQUEMA_EXPORT) });
    id = (await gql(app, `mutation($i: CrearParcelaInput!) { crearParcela(input: $i) { id } }`, { i: { punto: PUNTO } })).body.data.crearParcela.id;
  });
  afterAll(async () => {
    await app.close();
    await new Promise((r) => servidor.close(r));
    for (const k of ['ML_SERVICE_URL', 'ML_SERVICE_TOKEN', 'ML_SERVICE_TIMEOUT_MS', 'ML_SERVICE_BREAKER_FAILURES', 'ML_SERVICE_BREAKER_RESET_MS']) delete process.env[k];
  });
  beforeEach(async () => {
    modo = 'ok';
    visto.length = 0;
    await new Promise((r) => setTimeout(r, 600)); // deja que el circuit breaker de la prueba anterior se cierre
    await gql(app, `{ prediccionesEnVivo(parcelaId: "${id}") { fuente } }`); // un éxito reinicia los fallos
    visto.length = 0;
  });

  const CONSULTA = `query($id: ID!, $e: EscenarioInput) { prediccionesEnVivo(parcelaId: $id, escenario: $e) {
    fuente datosAl antiguedadDias obsoleto sitio distanciaKm latenciaMs advertencias
    resultados { concepto titulo unidad horizonte disponible valor serie datosAl rol algoritmo escenarioAplicado notas motivo fuente } } }`;
  const pedir = (e?: unknown) => gql(app, CONSULTA, { id, e });

  it('con el servicio funcionando devuelve datos VIVOS, lo que no se puede calcular dice por qué, y manda el token', async () => {
    const res = await pedir();
    expect(res.body.errors).toBeUndefined();
    const p = res.body.data.prediccionesEnVivo;
    expect(p).toMatchObject({ fuente: 'VIVO', datosAl: '2026-11-12', antiguedadDias: 3, obsoleto: false, sitio: 'greeley-riego' });
    const lluvia = p.resultados.find((r: any) => r.concepto === 'c08a');
    expect(lluvia).toMatchObject({ disponible: true, valor: 5.5, fuente: 'VIVO', algoritmo: 'CatBoost' });
    const calor = p.resultados.find((r: any) => r.concepto === 'c05b');
    expect(calor).toMatchObject({ disponible: false, valor: null });
    expect(calor.motivo).toMatch(/mayo a septiembre/); // fuera de temporada: no se inventa un número
    expect(p.resultados.find((r: any) => r.concepto === 'c08b').serie).toHaveLength(6);
    const llamada = visto.find((v) => v.ruta === 'POST /predict');
    expect(llamada?.token).toBe('secreto-de-prueba');
    expect(llamada?.cuerpo).toMatchObject({ lat: expect.closeTo(PUNTO.latitud, 2), lon: expect.closeTo(PUNTO.longitud, 2) });
  });

  it('el escenario de los sliders viaja al servicio y se ajusta a lo que calculan los modelos', async () => {
    const res = await pedir({ lluviaPct: 80, tempDeltaC: 9 });
    const p = res.body.data.prediccionesEnVivo;
    expect(visto.find((v) => v.ruta === 'POST /predict')?.cuerpo.scenario).toEqual({ rain_pct: 50, temp_delta: 4 });
    expect(p.advertencias.join(' ')).toMatch(/se ajustó/);
    const lluvia = p.resultados.find((r: any) => r.concepto === 'c08a');
    expect(lluvia).toMatchObject({ valor: 9.4, escenarioAplicado: true });
  });

  it('si el servicio falla, responde con el último LOTE marcado como obsoleto', async () => {
    modo = 'error500';
    const p = (await pedir()).body.data.prediccionesEnVivo;
    expect(p).toMatchObject({ fuente: 'LOTE', obsoleto: true });
    expect(p.resultados.map((r: any) => r.concepto).sort()).toEqual(['c04', 'c05b', 'c08a', 'c08b']);
    expect(p.resultados.every((r: any) => r.fuente === 'LOTE')).toBe(true);
    expect(p.resultados.find((r: any) => r.concepto === 'c08a').valor).toBeGreaterThanOrEqual(0);
    expect(p.advertencias.join(' ')).toMatch(/último lote/);
    expect(p.resultados.find((r: any) => r.concepto === 'c05b').notas.join(' ')).toMatch(/promedio de la temporada/);
  });

  it('si el servicio tarda más del límite, también usa el lote (no deja colgado al usuario)', async () => {
    modo = 'lento';
    const inicio = Date.now();
    const p = (await pedir()).body.data.prediccionesEnVivo;
    expect(Date.now() - inicio).toBeLessThan(1400);
    expect(p.fuente).toBe('LOTE');
    expect(p.advertencias.join(' ')).toMatch(/no respondió en 600 ms/);
  });

  it('con un token rechazado lo dice sin exponer el token', async () => {
    modo = 'sin-permiso';
    const res = await pedir();
    const p = res.body.data.prediccionesEnVivo;
    expect(p.fuente).toBe('LOTE');
    expect(p.advertencias.join(' ')).toMatch(/token válido/);
    expect(JSON.stringify(res.body)).not.toContain('secreto-de-prueba');
  });

  it('un punto fuera de la zona de entrenamiento no recibe predicciones de ninguna fuente', async () => {
    modo = 'fuera-de-zona';
    const p = (await pedir()).body.data.prediccionesEnVivo;
    expect(p).toMatchObject({ fuente: 'NO_DISPONIBLE', resultados: [] });
    expect(p.advertencias.join(' ')).toMatch(/Fuera de la zona/);
  });

  it('una respuesta con forma inesperada se descarta y se usa el lote', async () => {
    modo = 'basura';
    expect((await pedir()).body.data.prediccionesEnVivo.fuente).toBe('LOTE');
  });

  it('circuit breaker: tras 2 fallos seguidos no vuelve a llamar al servicio durante un rato, y luego reintenta', async () => {
    modo = 'error500';
    await pedir();
    await pedir();
    const llamadas = () => visto.filter((v) => v.ruta === 'POST /predict').length;
    expect(llamadas()).toBe(2);
    const p = (await pedir()).body.data.prediccionesEnVivo;
    expect(llamadas()).toBe(2); // el breaker está abierto: no se llamó
    expect(p.fuente).toBe('LOTE');
    expect(p.advertencias.join(' ')).toMatch(/fuera de línea/);
    modo = 'ok';
    await new Promise((r) => setTimeout(r, 550));
    expect((await pedir()).body.data.prediccionesEnVivo.fuente).toBe('VIVO');
  });

  it('sin servicio configurado responde con el lote y lo avisa', async () => {
    const espiar = jest.spyOn(app.get(MlVivoCliente), 'configurado', 'get').mockReturnValue(false);
    try {
      const p = (await pedir()).body.data.prediccionesEnVivo;
      expect(p.fuente).toBe('LOTE');
      expect(p.advertencias.join(' ')).toMatch(/no está configurado/);
      expect(visto.filter((v) => v.ruta === 'POST /predict')).toHaveLength(0);
    } finally {
      espiar.mockRestore();
    }
  });

  it('sin servicio y sin ningún lote importado, avisa claramente en vez de inventar', async () => {
    modo = 'error500';
    await prisma.versionPrediccion.updateMany({ data: { activa: false } });
    try {
      expect(codigo(await pedir())).toBe('FUENTE_NO_DISPONIBLE');
    } finally {
      await prisma.versionPrediccion.updateMany({ data: { activa: true } });
    }
  });

  it('valida la parcela y limita las consultas caras', async () => {
    expect(codigo(await gql(app, CONSULTA, { id: '99999999-9999-4999-8999-999999999999' }))).toBe('NO_ENCONTRADO');
    expect(codigo(await gql(app, CONSULTA, { id: 'no-es-uuid' }))).toBe('VALIDACION_FALLIDA');
    expect(codigo(await pedir({ lluviaPct: 500, tempDeltaC: 0 }))).toBe('VALIDACION_FALLIDA');
  });

  it('/health informa si el servicio de ml/ responde', async () => {
    const q = `{ salud { fuentes { nombre estado detalle } } }`;
    const f = (r: any) => r.body.data.salud.fuentes.find((x: any) => x.nombre.startsWith('predicciones en vivo'));
    expect(f(await gql(app, q))).toMatchObject({ estado: 'OK', detalle: expect.stringMatching(/c05b/) });
    modo = 'error500';
    expect(f(await gql(app, q)).estado).toBe('NO_DISPONIBLE');
  });
});

describe('validarRespuesta (no se confía en lo que llega por la red)', () => {
  it('rechaza formas inesperadas', () => {
    for (const malo of [null, 'x', {}, { results: [], data: null }, { results: [{ concept: 1 }], data: { last_date: 'a', age_days: 1 } },
      { results: [{ concept: 'c', title: 't', available: true, value: 'NaN' }], data: { last_date: '2026-01-01', age_days: 1 } }]) {
      expect(() => validarRespuesta(malo)).toThrow(/no válida/);
    }
  });
  it('acepta una respuesta completa y rellena lo opcional', () => {
    const r = validarRespuesta({ results: [{ concept: 'c08a', title: 't', available: true, value: 5.5 }], data: { last_date: '2026-11-12', age_days: 3 } });
    expect(r.results[0]).toMatchObject({ concept: 'c08a', value: 5.5, notes: [], scenario_applied: false });
    expect(r.data.stale).toBe(false);
  });
});
