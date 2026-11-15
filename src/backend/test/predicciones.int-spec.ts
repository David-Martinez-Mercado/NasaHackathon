import './env-int';
import { INestApplication } from '@nestjs/common';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImportacionService } from '../src/predicciones/importacion.service';
import { ValidadorExport } from '../src/predicciones/export-validator';
import { PrismaService } from '../src/prisma/prisma.service';
import { codigo, copiarExport, crearAppReal, ESQUEMA_EXPORT, EXPORT_V1, gql, reiniciarBase } from './helpers-int';

describe('Predicciones de ml/ (export real, PostgreSQL/PostGIS real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let importador: ImportacionService;
  const validador = ValidadorExport.desdeArchivo(ESQUEMA_EXPORT);

  beforeAll(async () => {
    ({ app, prisma } = await crearAppReal());
    importador = app.get(ImportacionService);
  });
  afterAll(() => app.close());
  beforeEach(() => reiniciarBase(prisma, false));

  const importar = (carpeta: string, activar = true) => importador.importar(carpeta, { activar, validador });
  const versiones = () => prisma.versionPrediccion.findMany({ select: { version: true, activa: true }, orderBy: { version: 'asc' } });

  describe('importación', () => {
    it('importa el export versionado de ml/ y lo deja activo', async () => {
      const r = await importar(EXPORT_V1);
      expect(r).toMatchObject({ version: 'v1', estado: 'importada', activa: true, capas: 5, series: 9, tablas: 3, alertas: 2 });
      expect(r.puntos).toBeGreaterThan(10);
      expect(await versiones()).toEqual([{ version: 'v1', activa: true }]);
      expect(await prisma.escenarioCapa.count()).toBe(20 + 20 + 1 + 1 + 1); // temperatura y lluvia: 20 escenarios; las demás, el base
      expect(await prisma.puntoMapa.count()).toBe(r.puntos);
    });

    it('importar la misma versión otra vez no duplica nada', async () => {
      await importar(EXPORT_V1);
      const otra = await importar(EXPORT_V1);
      expect(otra.estado).toBe('ya-importada');
      expect(await prisma.versionPrediccion.count()).toBe(1);
      expect(await prisma.capaMapa.count()).toBe(5);
    });

    it('la misma versión con otro contenido se rechaza', async () => {
      await importar(EXPORT_V1);
      const cambiado = copiarExport('v1', (carpeta) => {
        const ruta = join(carpeta, 'summaries.json');
        const resumen = JSON.parse(readFileSync(ruta, 'utf8'));
        resumen.unavailable.push('algo nuevo');
        writeFileSync(ruta, JSON.stringify(resumen));
      });
      await expect(importar(cambiado)).rejects.toThrow(/ya está importada con otro contenido/);
      expect(await prisma.versionPrediccion.count()).toBe(1);
    });

    it('una versión nueva reemplaza a la activa y siempre hay exactamente una', async () => {
      await importar(EXPORT_V1);
      const v2 = copiarExport('v2');
      const r = await importar(v2);
      expect(r.activa).toBe(true);
      expect(await versiones()).toEqual([{ version: 'v1', activa: false }, { version: 'v2', activa: true }]);
      // el índice único parcial impide dos activas aunque se intente a mano
      await expect(prisma.versionPrediccion.updateMany({ data: { activa: true } })).rejects.toThrow();
      expect((await versiones()).filter((v) => v.activa)).toHaveLength(1);
    });

    it('con activar=false la versión queda guardada pero la activa sigue siendo la anterior', async () => {
      await importar(EXPORT_V1);
      await importar(copiarExport('v2'), false);
      expect(await versiones()).toEqual([{ version: 'v1', activa: true }, { version: 'v2', activa: false }]);
    });
  });

  describe('importación atómica: si algo falla, queda exactamente lo que había', () => {
    it('un archivo modificado se detecta por su hash ANTES de tocar la base', async () => {
      const dañado = copiarExport('v-dañado');
      writeFileSync(join(dañado, 'layers', 'rain.json'), readFileSync(join(dañado, 'layers', 'rain.json'), 'utf8').replace('"c08a"', '"c99x"'));
      await expect(importar(dañado)).rejects.toThrow(/hash no coincide/);
      expect(await prisma.versionPrediccion.count()).toBe(0);
    });

    it('un archivo que no cumple el esquema se rechaza completo', async () => {
      const malo = copiarExport('v-malo', (carpeta) => {
        const ruta = join(carpeta, 'layers', 'drought.json');
        const capa = JSON.parse(readFileSync(ruta, 'utf8'));
        capa.kind = 'inventada';
        writeFileSync(ruta, JSON.stringify(capa));
      });
      await expect(importar(malo)).rejects.toThrow(/drought\.json/);
      expect(await prisma.versionPrediccion.count()).toBe(0);
    });

    it('una rejilla con el tamaño equivocado se rechaza', async () => {
      const malo = copiarExport('v-rejilla', (carpeta) => {
        const ruta = join(carpeta, 'layers', 'humidity.json');
        const capa = JSON.parse(readFileSync(ruta, 'utf8'));
        capa.scenarios[0].values.pop();
        writeFileSync(ruta, JSON.stringify(capa));
      });
      await expect(importar(malo)).rejects.toThrow(/valores y la rejilla/);
    });

    it('un fallo a MITAD de la escritura deshace toda la versión nueva y conserva la anterior', async () => {
      await importar(EXPORT_V1);
      const antes = {
        capas: await prisma.capaMapa.count(), puntos: await prisma.puntoMapa.count(),
        series: await prisma.serieDato.count(), escenarios: await prisma.escenarioCapa.count(),
      };
      // Pasa la validación del esquema, pero repite una serie: la base lo rechaza al insertar las series, cuando la versión,
      // las 5 capas y los puntos ya están escritos dentro de la transacción.
      const duplicada = copiarExport('v-duplicada', (carpeta) => {
        const ruta = join(carpeta, 'series', 'market.json');
        const serie = JSON.parse(readFileSync(ruta, 'utf8'));
        serie.series.push(serie.series[0]);
        writeFileSync(ruta, JSON.stringify(serie));
      });
      await expect(importar(duplicada)).rejects.toThrow();
      expect(await versiones()).toEqual([{ version: 'v1', activa: true }]);
      expect({
        capas: await prisma.capaMapa.count(), puntos: await prisma.puntoMapa.count(),
        series: await prisma.serieDato.count(), escenarios: await prisma.escenarioCapa.count(),
      }).toEqual(antes);
    });

    it('un export sin manifest o con una versión de contrato que no conoce se rechaza', async () => {
      await expect(importar('/ruta/que/no/existe')).rejects.toThrow();
      const futuro = copiarExport('v-futuro', () => undefined);
      const ruta = join(futuro, 'manifest.json');
      const manifest = JSON.parse(readFileSync(ruta, 'utf8'));
      manifest.schema_version = 99;
      writeFileSync(ruta, JSON.stringify(manifest));
      await expect(importar(futuro)).rejects.toThrow(/schema_version 99/);
    });
  });

  describe('consultas de lo importado (GraphQL)', () => {
    beforeEach(() => importar(EXPORT_V1).then(() => undefined));

    it('sin predicciones importadas las consultas avisan en vez de inventar', async () => {
      await reiniciarBase(prisma, false);
      const res = await gql(app, `{ capa(tipo: TEMPERATURA) { titulo } }`);
      expect(codigo(res)).toBe('SIN_PREDICCIONES');
      expect((await gql(app, `{ estadoPredicciones { version } }`)).body.data.estadoPredicciones).toBeNull();
    });

    it('capa: devuelve la rejilla con todo lo que necesita el frontend', async () => {
      const res = await gql(app, `{ capa(tipo: LLUVIA) {
        tipo concepto titulo unidad min max leyenda resolucionM interpolada datosAl version fuente notas
        rampa { en color } rejilla { bbox columnas filas valores } escenario { lluviaPct tempDeltaC aplica interpolado recortado } } }`);
      expect(res.body.errors).toBeUndefined();
      const c = res.body.data.capa;
      expect(c).toMatchObject({ tipo: 'LLUVIA', concepto: 'c08a', unidad: '%', min: 0, max: 100, interpolada: true, version: 'v1' });
      expect(c.rejilla.valores).toHaveLength(c.rejilla.columnas * c.rejilla.filas);
      expect(c.rejilla.bbox).toHaveLength(4);
      expect(c.rampa[0]).toEqual({ en: 0, color: expect.stringMatching(/^#[0-9A-F]{6}$/i) });
      expect(c.leyenda).toHaveLength(5);
      expect(c.escenario).toMatchObject({ lluviaPct: 0, tempDeltaC: 0, aplica: true, interpolado: false, recortado: false });
      expect(c.notas.join(' ')).toMatch(/sensibilidad/);
    });

    it('los sliders: un escenario calculado es exacto y uno intermedio se interpola entre sus vecinos', async () => {
      const pedir = (lluviaPct: number, tempDeltaC: number) =>
        gql(app, `query($e: EscenarioInput) { capa(tipo: TEMPERATURA, escenario: $e) { rejilla { valores } escenario { lluviaPct tempDeltaC interpolado recortado } } }`, { e: { lluviaPct, tempDeltaC } })
          .then((r) => r.body.data.capa);
      const base = await pedir(0, 0);
      const calido = await pedir(0, 2);
      const intermedio = await pedir(0, 1);
      expect(base.escenario.interpolado).toBe(false);
      expect(intermedio.escenario).toMatchObject({ tempDeltaC: 1, interpolado: true });
      const media = (v: (number | null)[]) => v.filter((x): x is number => x != null).reduce((a, b) => a + b, 0) / v.length;
      expect(media(calido.rejilla.valores)).toBeGreaterThan(media(base.rejilla.valores)); // más calor, más riesgo de ola
      expect(media(intermedio.rejilla.valores)).toBeGreaterThan(media(base.rejilla.valores));
      expect(media(intermedio.rejilla.valores)).toBeLessThan(media(calido.rejilla.valores));
      // exactamente a medio camino en cada celda (la interpolación es bilineal)
      for (let i = 0; i < base.rejilla.valores.length; i += 97) {
        expect(intermedio.rejilla.valores[i]).toBeCloseTo((base.rejilla.valores[i] + calido.rejilla.valores[i]) / 2, 3);
      }
      const fuera = await pedir(0, 4); // el máximo calculado: exacto, no recortado
      expect(fuera.escenario).toMatchObject({ tempDeltaC: 4, recortado: false });
    });

    it('un escenario fuera de lo calculado se recorta al borde y lo dice', async () => {
      const res = await gql(app, `{ capa(tipo: LLUVIA, escenario: { lluviaPct: 90, tempDeltaC: 9 }) { escenario { lluviaPct tempDeltaC recortado } } }`);
      expect(res.body.data.capa.escenario).toEqual({ lluviaPct: 50, tempDeltaC: 4, recortado: true });
    });

    it('una capa que no usa los sliders devuelve siempre su escenario base', async () => {
      const a = await gql(app, `{ capa(tipo: HUMEDAD) { rejilla { valores } escenario { aplica interpolado } } }`);
      const b = await gql(app, `{ capa(tipo: HUMEDAD, escenario: { lluviaPct: 40, tempDeltaC: 3 }) { rejilla { valores } escenario { aplica interpolado lluviaPct } } }`);
      expect(b.body.data.capa.escenario).toEqual({ aplica: false, interpolado: false, lluviaPct: 0 });
      expect(b.body.data.capa.rejilla.valores).toEqual(a.body.data.capa.rejilla.valores);
    });

    it('rechaza escenarios fuera de los rangos de los sliders', async () => {
      expect(codigo(await gql(app, `{ capa(tipo: LLUVIA, escenario: { lluviaPct: 500, tempDeltaC: 0 }) { titulo } }`))).toBe('VALIDACION_FALLIDA');
    });

    it('la vulnerabilidad deja sin dato las celdas sin cultivo (no las inventa)', async () => {
      const res = await gql(app, `{ capa(tipo: VULNERABILIDAD) { rejilla { valores } interpolada } }`);
      const valores: (number | null)[] = res.body.data.capa.rejilla.valores;
      expect(valores.some((v) => v === null)).toBe(true);
      expect(valores.some((v) => v !== null)).toBe(true);
      expect(res.body.data.capa.interpolada).toBe(false);
    });

    it('puntos de estrés con severidad, y filtrados por una caja del mapa', async () => {
      const todos = await gql(app, `{ puntos(tipo: ESTRES) { tipo datosAl notas puntos { id latitud longitud severidad valor etiqueta } } }`);
      const c = todos.body.data.puntos;
      expect(c.puntos.length).toBeGreaterThan(10);
      expect(c.puntos[0]).toMatchObject({ latitud: expect.any(Number), longitud: expect.any(Number) });
      expect(['ALTA', 'MEDIA']).toContain(c.puntos[0].severidad);
      const altos = c.puntos.filter((p: any) => p.severidad === 'ALTA').length;
      expect(c.puntos.slice(0, altos).every((p: any) => p.severidad === 'ALTA')).toBe(true); // las altas primero
      const caja = await gql(app, `{ puntos(tipo: ESTRES, caja: { bbox: [-104.0, 40.0, -103.9, 40.1] }) { puntos { id } } }`);
      expect(caja.body.data.puntos.puntos.length).toBeLessThan(c.puntos.length);
      const mal = await gql(app, `{ puntos(tipo: ESTRES, caja: { bbox: [1, 2, 3] }) { puntos { id } } }`);
      expect(codigo(mal)).toBe('VALIDACION_FALLIDA');
    });

    it('series de mercado con pronóstico marcado y estadísticas de campo contra región', async () => {
      const mercado = (await gql(app, `{ series(prefijo: "market:") { clave unidad puntos { etiqueta a pronostico } } }`)).body.data.series;
      expect(mercado.map((s: any) => s.clave)).toContain('market:maiz');
      const maiz = mercado.find((s: any) => s.clave === 'market:maiz');
      expect(maiz.unidad).toBe('$ / BU');
      expect(maiz.puntos.filter((p: any) => p.pronostico)).toHaveLength(6);
      expect(maiz.puntos.slice(0, -6).every((p: any) => p.pronostico === false)).toBe(true);
      const est = (await gql(app, `{ series(prefijo: "statistics:") { clave etiquetaA etiquetaB puntos { etiqueta a b } } }`)).body.data.series;
      expect(est).toHaveLength(2);
      expect(est[0].puntos[0]).toMatchObject({ etiqueta: expect.stringMatching(/^20\d\d$/), a: expect.any(Number), b: expect.any(Number) });
    });

    it('tablas de modelos, alertas con su definición y resúmenes', async () => {
      const t = (await gql(app, `{ tablaModelo(clave: "rotacion") { concepto unidad notas filas } }`)).body.data.tablaModelo;
      expect(t.concepto).toBe('c02');
      expect(t.filas[0]).toMatchObject({ prev_crop: expect.any(String), next_crop: expect.any(String), probability_pct: expect.any(Number) });
      expect((await gql(app, `{ tablaModelo(clave: "no-existe") { clave } }`)).body.data.tablaModelo).toBeNull();
      const alertas = (await gql(app, `{ alertas { tipo valor unidad detalle definicion datosAl } }`)).body.data.alertas;
      expect(alertas.map((a: any) => a.tipo)).toEqual(['drought', 'stress']);
      expect(alertas.every((a: any) => a.definicion.length > 10)).toBe(true);
      const h = (await gql(app, `{ resumenHumedad { raiz superficie evaporacion percentil datosAl } }`)).body.data.resumenHumedad;
      expect(h.percentil).toBeGreaterThanOrEqual(0);
      expect(h.percentil).toBeLessThanOrEqual(100);
      const c = (await gql(app, `{ resumenClima { lluviaMensualMm olaDeCalor7DiasPct temperaturaMaxC notas } }`)).body.data.resumenClima;
      expect(c.lluviaMensualMm).toHaveLength(6);
      expect(c.notas.join(' ')).toMatch(/no un pronóstico/);
    });

    it('sugerenciasCultivo: ordena otros cultivos con rotación, precio y familia, sin inventar lo que falta', async () => {
      await prisma.cultivo.createMany({ data: [
        { codigo: 'maiz', nombre: 'Maíz', familiaBotanica: 'Poaceae' },
        { codigo: 'remolacha', nombre: 'Remolacha', familiaBotanica: 'Amaranthaceae' },
        { codigo: 'trigo', nombre: 'Trigo', familiaBotanica: 'Poaceae' },
        { codigo: 'soya', nombre: 'Soya', familiaBotanica: 'Fabaceae' },
      ] });
      const crear = await gql(app, `mutation { crearParcela(input: { punto: { latitud: 40.4, longitud: -104.7 }, cultivoActual: "maiz" }) { id } }`);
      const id = crear.body.data.crearParcela.id;
      const res = await gql(app, `query($id: ID!) { sugerenciasCultivo(parcelaId: $id) { cultivoBase origenBase metodo advertencias
        sugerencias { cultivo nombre puntaje probabilidadSiguientePct cambioPrecioPct unidadPrecio otraFamilia } } }`, { id });
      expect(res.body.errors).toBeUndefined();
      const s = res.body.data.sugerenciasCultivo;
      expect(s).toMatchObject({ cultivoBase: 'maiz', origenBase: 'actual' });
      expect(s.sugerencias.length).toBeGreaterThan(0);
      expect(s.sugerencias.map((x: any) => x.cultivo)).not.toContain('maiz'); // sugiere CAMBIAR, no repetir
      expect(s.sugerencias.map((x: any) => x.cultivo)).not.toContain('barbecho');
      const puntajes = s.sugerencias.map((x: any) => x.puntaje);
      expect(puntajes).toEqual([...puntajes].sort((a: number, b: number) => b - a));
      for (const x of s.sugerencias) {
        expect(x.puntaje).toBeGreaterThanOrEqual(0);
        expect(x.puntaje).toBeLessThanOrEqual(100);
      }
      const soya = s.sugerencias.find((x: any) => x.cultivo === 'soya');
      if (soya) expect(soya.probabilidadSiguientePct).toBeNull(); // la soya no está en la tabla de rotación: no se inventa
      expect(s.advertencias.join(' ')).toMatch(/no sustituye/);
    });

    it('riesgosParcela: evalúa la zona con los modelos de ml/ y declara de dónde sale cada dato', async () => {
      const id = (await gql(app, `mutation { crearParcela(input: { punto: { latitud: 40.42, longitud: -104.71 } }) { id } }`)).body.data.crearParcela.id;
      const res = await gql(app, `query($id: ID!) { riesgosParcela(parcelaId: $id) { advertencias
        riesgos { clave nivel valor unidad modelo datosAl resolucionM interpolada puntosCercanos puntosCriticos radioKm } } }`, { id });
      expect(res.body.errors).toBeUndefined();
      const r = Object.fromEntries(res.body.data.riesgosParcela.riesgos.map((x: any) => [x.clave, x]));
      expect(Object.keys(r).sort()).toEqual(['calor', 'estres', 'humedad', 'lluvia', 'sequia', 'vulnerabilidad']);
      expect(r.calor).toMatchObject({ modelo: 'c05b', unidad: '%', interpolada: true });
      expect(['BAJO', 'MEDIO', 'ALTO']).toContain(r.calor.nivel);
      expect(r.sequia.modelo).toBe('c05a');
      expect(r.estres.puntosCercanos).toBeGreaterThanOrEqual(r.estres.puntosCriticos);
      expect(r.estres.radioKm).toBe(10);
      expect(r.lluvia.nivel).toBeNull(); // la lluvia es informativa, no un riesgo con semáforo
      expect(codigo(await gql(app, `{ riesgosParcela(parcelaId: "99999999-9999-4999-8999-999999999999") { riesgos { clave } } }`))).toBe('NO_ENCONTRADO');
    });

    it('sugerenciasCultivo: las prioridades cambian el orden (ingreso vs suelo) y se pueden probar sin guardar', async () => {
      await prisma.cultivo.createMany({ data: [
        { codigo: 'maiz', nombre: 'Maíz', familiaBotanica: 'Poaceae' }, { codigo: 'soya', nombre: 'Soya', familiaBotanica: 'Fabaceae' },
        { codigo: 'sorgo', nombre: 'Sorgo', familiaBotanica: 'Poaceae' }, { codigo: 'avena', nombre: 'Avena', familiaBotanica: 'Poaceae' },
        { codigo: 'alfalfa', nombre: 'Alfalfa', familiaBotanica: 'Fabaceae' }, { codigo: 'trigo', nombre: 'Trigo', familiaBotanica: 'Poaceae' },
      ], skipDuplicates: true });
      const id = (await gql(app, `mutation { crearParcela(input: { punto: { latitud: 40.42, longitud: -104.71 }, cultivoActual: "maiz",
        preferencias: { sistemaRiego: TEMPORAL } }) { id } }`)).body.data.crearParcela.id;
      const consulta = `query($id: ID!, $p: PrioridadesInput) { sugerenciasCultivo(parcelaId: $id, prioridades: $p) {
        prioridades { agua suelo erosion ingreso } pesos { agua suelo erosion ingreso local } ajustes rasgosVerificados
        actual { cultivo puntaje } sugerencias { cultivo puntaje aportes { factor puntaje peso } fijaNitrogeno demandaAgua } } }`;
      const dinero = (await gql(app, consulta, { id, p: { agua: 0, suelo: 0, erosion: 0, ingreso: 100 } })).body.data.sugerenciasCultivo;
      const tierra = (await gql(app, consulta, { id, p: { agua: 0, suelo: 100, erosion: 0, ingreso: 0 } })).body.data.sugerenciasCultivo;
      expect(dinero.prioridades).toEqual({ agua: 0, suelo: 0, erosion: 0, ingreso: 100 });
      expect(dinero.pesos).toMatchObject({ agua: 0, suelo: 0, erosion: 0, ingreso: 1, local: 0.15 });
      expect(dinero.rasgosVerificados).toBe(false); // las clasificaciones generales se declaran sin verificar
      expect(dinero.actual.cultivo).toBe('maiz');
      // cuidando el suelo, las leguminosas (fijan nitrógeno) suben al primer lugar
      expect(tierra.sugerencias[0].fijaNitrogeno).toBe(true);
      expect(dinero.sugerencias.map((x: any) => x.cultivo)).not.toEqual(tierra.sugerencias.map((x: any) => x.cultivo));
      for (const s of dinero.sugerencias) expect(s.aportes.find((a: any) => a.factor === 'suelo')?.peso).toBe(0);
      // las prioridades guardadas se usan cuando no se pasan otras
      const guardadas = (await gql(app, consulta, { id })).body.data.sugerenciasCultivo;
      expect(guardadas.prioridades).toEqual({ agua: 50, suelo: 50, erosion: 50, ingreso: 50 });
      expect(guardadas.ajustes.length).toBeGreaterThanOrEqual(0);
    });

    it('sugerenciasCultivo: respeta los cultivos excluidos y marca los preferidos', async () => {
      await prisma.cultivo.createMany({ data: [
        { codigo: 'maiz', nombre: 'Maíz', familiaBotanica: 'Poaceae' }, { codigo: 'soya', nombre: 'Soya', familiaBotanica: 'Fabaceae' },
        { codigo: 'sorgo', nombre: 'Sorgo', familiaBotanica: 'Poaceae' }, { codigo: 'avena', nombre: 'Avena', familiaBotanica: 'Poaceae' },
      ], skipDuplicates: true });
      const id = (await gql(app, `mutation { crearParcela(input: { punto: { latitud: 40.42, longitud: -104.71 }, cultivoActual: "maiz",
        preferencias: { sistemaRiego: TEMPORAL, cultivosExcluidos: ["soya"], cultivosPreferidos: ["avena"] } }) { id } }`)).body.data.crearParcela.id;
      const s = (await gql(app, `query($id: ID!) { sugerenciasCultivo(parcelaId: $id) { sugerencias { cultivo preferido } } }`, { id })).body.data.sugerenciasCultivo;
      expect(s.sugerencias.map((x: any) => x.cultivo)).not.toContain('soya');
      expect(s.sugerencias.find((x: any) => x.cultivo === 'avena')?.preferido).toBe(true);
    });

    it('sugerenciasCultivo: sin cultivo ni historial lo avisa, y una parcela inexistente da NO_ENCONTRADO', async () => {
      const id = (await gql(app, `mutation { crearParcela(input: { punto: { latitud: 40.4, longitud: -104.7 } }) { id } }`)).body.data.crearParcela.id;
      const res = await gql(app, `query($id: ID!) { sugerenciasCultivo(parcelaId: $id) { cultivoBase advertencias } }`, { id });
      expect(res.body.data.sugerenciasCultivo.cultivoBase).toBeNull();
      expect(res.body.data.sugerenciasCultivo.advertencias[0]).toMatch(/cultivo actual/);
      expect(codigo(await gql(app, `{ sugerenciasCultivo(parcelaId: "99999999-9999-4999-8999-999999999999") { cultivoBase } }`))).toBe('NO_ENCONTRADO');
    });

    it('lo que no existe se declara, no se inventa', async () => {
      const res = await gql(app, `{ datosNoDisponibles }`);
      expect(res.body.data.datosNoDisponibles.join(' ')).toMatch(/erosión/);
      expect(res.body.data.datosNoDisponibles.join(' ')).toMatch(/Reservas de agua/);
    });

    it('estadoPredicciones lista los modelos con su evaluación y sus límites', async () => {
      const e = (await gql(app, `{ estadoPredicciones { version datosAl limitaciones modelos { concepto rol algoritmo metrica valor intervaloInf intervaloSup skill base notas } } }`)).body.data.estadoPredicciones;
      expect(e.version).toBe('v1');
      expect(e.modelos).toHaveLength(11);
      const calor = e.modelos.find((m: any) => m.concepto === 'c05b');
      expect(calor).toMatchObject({ rol: 'modelo', metrica: 'roc_auc' });
      expect(calor.valor).toBeGreaterThan(0.8);
      expect(calor.intervaloInf).toBeLessThan(calor.valor);
      expect(e.modelos.find((m: any) => m.concepto === 'c05a').rol).toBe('regla-base'); // una regla no se presenta como modelo
      expect(e.limitaciones.join(' ')).toMatch(/Weld/);
    });
  });
});
