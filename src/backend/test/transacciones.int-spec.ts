import './env-int';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { codigo, crearAppReal, gql, POLIGONO, PUNTO, reiniciarBase } from './helpers-int';

const CREAR = `mutation($input: CrearParcelaInput!) {
  crearParcela(input: $input) { id version nombre areaHa cultivoActual latitud longitud
    preferencias { sistemaRiego riego tipoSuelo prioridades { agua suelo erosion ingreso } maquinaria }
    historial { anio cultivo fechaSiembra descripcion } }
}`;

describe('Transacciones de la API GraphQL (PostgreSQL/PostGIS real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => ({ app, prisma } = await crearAppReal()));
  afterAll(() => app.close());
  beforeEach(() => reiniciarBase(prisma));

  const contar = async () => ({
    parcelas: await prisma.parcela.count(),
    preferencias: await prisma.preferencias.count(),
    historial: await prisma.historialParcela.count(),
    escenarios: await prisma.escenario.count(),
  });

  describe('crearParcela es todo o nada', () => {
    it('guarda parcela, preferencias e historial juntos', async () => {
      const res = await gql(app, CREAR, {
        input: {
          nombre: 'Chili field', descripcion: 'Parcela de prueba', cultivoActual: 'maiz', poligono: POLIGONO,
          preferencias: {
            sistemaRiego: 'GOTEO', aguaRiegoMm: 350, tipoSuelo: 'FRANCO', mesesVaciosDesde: 12, mesesVaciosHasta: 2,
            maquinaria: ['seed-drill'], cultivosPreferidos: ['frijol'], prioridades: { agua: 40, suelo: 80, erosion: 25, ingreso: 90 },
          },
          historial: [
            { anio: 2023, cultivo: 'maiz', fechaSiembra: '2023-04-20', descripcion: 'Riego por goteo' },
            { anio: 2022, cultivo: 'frijol' },
          ],
        },
      }).expect(200);
      expect(res.body.errors).toBeUndefined();
      const p = res.body.data.crearParcela;
      expect(p.version).toBe(1);
      expect(p.areaHa).toBeGreaterThan(30); // ~2 km × 2.2 km sobre geography (≈ 36 ha)
      expect(p.preferencias).toMatchObject({ sistemaRiego: 'GOTEO', riego: true, tipoSuelo: 'FRANCO', prioridades: { agua: 40, suelo: 80, erosion: 25, ingreso: 90 } });
      expect(p.historial.map((h: any) => h.anio)).toEqual([2023, 2022]);
      expect(p.historial[0]).toMatchObject({ cultivo: 'maiz', fechaSiembra: '2023-04-20', descripcion: 'Riego por goteo' });
      expect(await contar()).toMatchObject({ parcelas: 1, preferencias: 1, historial: 2 });
    });

    it('si un cultivo del historial no existe, no queda NADA guardado', async () => {
      const res = await gql(app, CREAR, {
        input: {
          nombre: 'x', punto: PUNTO, preferencias: { sistemaRiego: 'TEMPORAL' },
          historial: [{ anio: 2023, cultivo: 'maiz' }, { anio: 2022, cultivo: 'unicornio' }],
        },
      });
      expect(codigo(res)).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors[0].message).toContain('unicornio');
      expect(await contar()).toEqual({ parcelas: 0, preferencias: 0, historial: 0, escenarios: 0 });
    });

    it('si el historial repite un año, no queda nada', async () => {
      const res = await gql(app, CREAR, {
        input: { punto: PUNTO, historial: [{ anio: 2023, cultivo: 'maiz' }, { anio: 2023, cultivo: 'avena' }] },
      });
      expect(codigo(res)).toBe('VALIDACION_FALLIDA');
      expect(res.body.errors[0].message).toMatch(/repeats a year/);
      expect((await contar()).parcelas).toBe(0);
    });

    it('si las preferencias fallan a mitad de la transacción, la parcela ya insertada se deshace', async () => {
      // La parcela se inserta primero; el cultivo preferido que no existe se detecta DESPUÉS, dentro de la misma transacción
      const res = await gql(app, CREAR, { input: { punto: PUNTO, preferencias: { sistemaRiego: 'TEMPORAL', cultivosPreferidos: ['unicornio'] } } });
      expect(codigo(res)).toBe('VALIDACION_FALLIDA');
      expect(await contar()).toEqual({ parcelas: 0, preferencias: 0, historial: 0, escenarios: 0 });
    });

    it('una fecha de siembra imposible o de otro año revierte todo', async () => {
      const falsa = await gql(app, CREAR, { input: { punto: PUNTO, historial: [{ anio: 2023, cultivo: 'maiz', fechaSiembra: '2023-02-31' }] } });
      expect(codigo(falsa)).toBe('VALIDACION_FALLIDA');
      const lejana = await gql(app, CREAR, { input: { punto: PUNTO, historial: [{ anio: 2023, cultivo: 'maiz', fechaSiembra: '2019-04-20' }] } });
      expect(lejana.body.errors[0].message).toMatch(/2022 o de 2023/);
      expect((await contar()).parcelas).toBe(0);
    });

    it('un polígono que se cruza consigo mismo no guarda nada', async () => {
      const corbata = { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] };
      const res = await gql(app, CREAR, { input: { poligono: corbata, preferencias: { sistemaRiego: 'TEMPORAL' } } });
      expect(codigo(res)).toBe('GEOMETRIA_INVALIDA');
      expect(await contar()).toEqual({ parcelas: 0, preferencias: 0, historial: 0, escenarios: 0 });
    });

    it('un valor con comillas se guarda como texto (SQL parametrizado)', async () => {
      const nombre = `x'); DROP TABLE "Parcela"; --`;
      const res = await gql(app, CREAR, { input: { nombre, punto: PUNTO } });
      expect(res.body.data.crearParcela.nombre).toBe(nombre);
      expect((await contar()).parcelas).toBe(1);
    });
  });

  describe('claveIdempotencia: reintentar no duplica', () => {
    const entrada = (clave: string, nombre = 'A') => ({ claveIdempotencia: clave, nombre, punto: PUNTO, preferencias: { sistemaRiego: 'TEMPORAL' } });

    it('la misma clave devuelve la misma parcela y no crea otra', async () => {
      const a = await gql(app, CREAR, { input: entrada('clave-de-prueba-1') });
      const b = await gql(app, CREAR, { input: entrada('clave-de-prueba-1', 'otro nombre') });
      expect(b.body.data.crearParcela.id).toBe(a.body.data.crearParcela.id);
      expect(b.body.data.crearParcela.nombre).toBe('A'); // se devuelve la ya creada, no se reescribe
      expect(await contar()).toMatchObject({ parcelas: 1, preferencias: 1 });
    });

    it('claves distintas crean parcelas distintas', async () => {
      await gql(app, CREAR, { input: entrada('clave-de-prueba-1') });
      await gql(app, CREAR, { input: entrada('clave-de-prueba-2') });
      expect((await contar()).parcelas).toBe(2);
    });

    it('dos peticiones simultáneas con la misma clave dejan una sola parcela', async () => {
      const [a, b] = await Promise.all([
        gql(app, CREAR, { input: entrada('clave-simultanea') }),
        gql(app, CREAR, { input: entrada('clave-simultanea') }),
      ]);
      expect(a.body.errors).toBeUndefined();
      expect(b.body.errors).toBeUndefined();
      expect(a.body.data.crearParcela.id).toBe(b.body.data.crearParcela.id);
      expect((await contar()).parcelas).toBe(1);
    });

    it('rechaza claves demasiado cortas o con caracteres raros', async () => {
      expect(codigo(await gql(app, CREAR, { input: entrada('corta') }))).toBe('VALIDACION_FALLIDA');
      expect(codigo(await gql(app, CREAR, { input: entrada('con espacios y ñ') }))).toBe('VALIDACION_FALLIDA');
    });
  });

  describe('actualizarParcela: bloqueo optimista', () => {
    const ACTUALIZAR = `mutation($id: ID!, $input: ActualizarParcelaInput!) {
      actualizarParcela(id: $id, input: $input) { id version nombre descripcion cultivoActual areaHa latitud longitud actualizadaEn creadaEn } }`;
    let id: string;

    beforeEach(async () => {
      const res = await gql(app, CREAR, { input: { nombre: 'Original', descripcion: 'd', cultivoActual: 'maiz', poligono: POLIGONO } });
      id = res.body.data.crearParcela.id;
    });

    it('con la versión correcta cambia y sube la versión', async () => {
      const res = await gql(app, ACTUALIZAR, { id, input: { version: 1, nombre: 'Nuevo', cultivoActual: 'frijol' } });
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.actualizarParcela).toMatchObject({ version: 2, nombre: 'Nuevo', cultivoActual: 'frijol', descripcion: 'd' });
      expect(new Date(res.body.data.actualizarParcela.actualizadaEn).getTime()).toBeGreaterThanOrEqual(new Date(res.body.data.actualizarParcela.creadaEn).getTime());
    });

    it('con una versión vieja se rechaza y NO cambia nada', async () => {
      await gql(app, ACTUALIZAR, { id, input: { version: 1, nombre: 'Primero' } });
      const res = await gql(app, ACTUALIZAR, { id, input: { version: 1, nombre: 'Pisando al otro' } });
      expect(codigo(res)).toBe('CONFLICTO_VERSION');
      expect(res.body.errors[0].message).toMatch(/changed while you were editing it/);
      const fila = await prisma.parcela.findUnique({ where: { id }, select: { nombre: true, version: true } });
      expect(fila).toEqual({ nombre: 'Primero', version: 2 });
    });

    it('dos actualizaciones simultáneas con la misma versión: gana una, la otra recibe el conflicto', async () => {
      const [a, b] = await Promise.all([
        gql(app, ACTUALIZAR, { id, input: { version: 1, nombre: 'A' } }),
        gql(app, ACTUALIZAR, { id, input: { version: 1, nombre: 'B' } }),
      ]);
      const codigos = [codigo(a), codigo(b)].sort();
      expect(codigos).toEqual(['CONFLICTO_VERSION', undefined].sort());
      const fila = await prisma.parcela.findUnique({ where: { id }, select: { version: true } });
      expect(fila?.version).toBe(2); // exactamente un cambio se aplicó
    });

    it('null borra un campo y omitirlo lo deja como está', async () => {
      const res = await gql(app, ACTUALIZAR, { id, input: { version: 1, descripcion: null } });
      expect(res.body.data.actualizarParcela).toMatchObject({ descripcion: null, nombre: 'Original', cultivoActual: 'maiz' });
    });

    it('cambiar la forma recalcula centroide y hectáreas; una forma inválida se rechaza sin tocar la anterior', async () => {
      const antes = (await gql(app, ACTUALIZAR, { id, input: { version: 1, nombre: 'Original' } })).body.data.actualizarParcela;
      const grande = { type: 'Polygon', coordinates: [[[-104.8, 40.3], [-104.6, 40.3], [-104.6, 40.5], [-104.8, 40.5], [-104.8, 40.3]]] };
      const res = await gql(app, ACTUALIZAR, { id, input: { version: 2, poligono: grande } });
      expect(res.body.data.actualizarParcela.areaHa).toBeGreaterThan(antes.areaHa * 10);
      expect(res.body.data.actualizarParcela.longitud).toBeCloseTo(-104.7, 3);

      const corbata = { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] };
      const mala = await gql(app, ACTUALIZAR, { id, input: { version: 3, poligono: corbata } });
      expect(codigo(mala)).toBe('GEOMETRIA_INVALIDA');
      expect((await prisma.parcela.findUnique({ where: { id }, select: { version: true } }))?.version).toBe(3);
    });

    it('cambia nombre y preferencias en una sola transacción; si las preferencias fallan, el nombre tampoco cambia', async () => {
      const ok = await gql(app, `mutation($id: ID!, $input: ActualizarParcelaInput!) {
        actualizarParcela(id: $id, input: $input) { version nombre preferencias { sistemaRiego tipoSuelo prioridades { agua } } } }`,
        { id, input: { version: 1, nombre: 'Editada', preferencias: { sistemaRiego: 'GOTEO', tipoSuelo: 'ARENOSO', prioridades: { agua: 10, suelo: 20, erosion: 30, ingreso: 40 } } } });
      expect(ok.body.errors).toBeUndefined();
      expect(ok.body.data.actualizarParcela).toMatchObject({ version: 2, nombre: 'Editada', preferencias: { sistemaRiego: 'GOTEO', tipoSuelo: 'ARENOSO', prioridades: { agua: 10 } } });

      const mala = await gql(app, ACTUALIZAR.replace('ActualizarParcelaInput!', 'ActualizarParcelaInput!'), { id, input: { version: 2, nombre: 'No debe quedar', preferencias: { sistemaRiego: 'TEMPORAL', cultivosPreferidos: ['unicornio'] } } });
      expect(codigo(mala)).toBe('VALIDACION_FALLIDA');
      const fila = await prisma.parcela.findUnique({ where: { id }, select: { nombre: true, version: true } });
      expect(fila).toEqual({ nombre: 'Editada', version: 2 });
    });

    it('solo preferencias (sin otros cambios) también sube la versión', async () => {
      const res = await gql(app, ACTUALIZAR, { id, input: { version: 1, preferencias: { sistemaRiego: 'GRAVEDAD' } } });
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.actualizarParcela.version).toBe(2);
      expect((await prisma.preferencias.findUnique({ where: { parcelaId: id } }))?.sistemaRiego).toBe('GRAVEDAD');
    });

    it('rechaza cultivos desconocidos, cambios vacíos, punto y polígono a la vez, e ids inexistentes', async () => {
      expect(codigo(await gql(app, ACTUALIZAR, { id, input: { version: 1, cultivoActual: 'unicornio' } }))).toBe('VALIDACION_FALLIDA');
      expect(codigo(await gql(app, ACTUALIZAR, { id, input: { version: 1 } }))).toBe('VALIDACION_FALLIDA');
      expect(codigo(await gql(app, ACTUALIZAR, { id, input: { version: 1, punto: PUNTO, poligono: POLIGONO } }))).toBe('VALIDACION_FALLIDA');
      expect(codigo(await gql(app, ACTUALIZAR, { id: '99999999-9999-4999-8999-999999999999', input: { version: 1, nombre: 'x' } }))).toBe('NO_ENCONTRADO');
    });
  });

  describe('eliminarParcela', () => {
    const ELIMINAR = `mutation($id: ID!, $version: Int!) { eliminarParcela(id: $id, version: $version) }`;

    it('con la versión vigente borra la parcela y todo lo suyo en cascada', async () => {
      const res = await gql(app, CREAR, {
        input: { punto: PUNTO, preferencias: { sistemaRiego: 'TEMPORAL' }, historial: [{ anio: 2023, cultivo: 'maiz' }] },
      });
      const id = res.body.data.crearParcela.id;
      await prisma.escenario.create({ data: { parcelaId: id, lluviaPct: 0, tempDeltaC: 0, resultado: [] } });
      expect(await contar()).toEqual({ parcelas: 1, preferencias: 1, historial: 1, escenarios: 1 });
      const del = await gql(app, ELIMINAR, { id, version: 1 });
      expect(del.body.data.eliminarParcela).toBe(true);
      expect(await contar()).toEqual({ parcelas: 0, preferencias: 0, historial: 0, escenarios: 0 });
    });

    it('con una versión vieja no borra nada', async () => {
      const id = (await gql(app, CREAR, { input: { punto: PUNTO } })).body.data.crearParcela.id;
      await gql(app, `mutation($id: ID!) { actualizarParcela(id: $id, input: { version: 1, nombre: "x" }) { version } }`, { id });
      const del = await gql(app, ELIMINAR, { id, version: 1 });
      expect(codigo(del)).toBe('CONFLICTO_VERSION');
      expect((await contar()).parcelas).toBe(1);
    });

    it('una parcela que no existe responde NO_ENCONTRADO', async () => {
      expect(codigo(await gql(app, ELIMINAR, { id: '99999999-9999-4999-8999-999999999999', version: 1 }))).toBe('NO_ENCONTRADO');
    });
  });

  describe('guardarPreferencias e historial por separado', () => {
    let id: string;
    const GUARDAR = `mutation($id: ID!, $input: PreferenciasInput!) { guardarPreferencias(parcelaId: $id, input: $input) { sistemaRiego cultivosPreferidos prioridades { agua } } }`;
    const HISTORIAL = `mutation($id: ID!, $input: HistorialInput!) { guardarHistorial(parcelaId: $id, input: $input) { anio cultivo descripcion } }`;

    beforeEach(async () => {
      id = (await gql(app, CREAR, { input: { punto: PUNTO, preferencias: { sistemaRiego: 'ASPERSION', cultivosPreferidos: ['maiz'], prioridades: { agua: 10, suelo: 20, erosion: 30, ingreso: 40 } } } })).body.data.crearParcela.id;
    });

    it('reemplaza las preferencias; si la nueva es inválida, queda la anterior intacta', async () => {
      const ok = await gql(app, GUARDAR, { id, input: { sistemaRiego: 'GOTEO', cultivosPreferidos: ['frijol'] } });
      expect(ok.body.data.guardarPreferencias).toMatchObject({ sistemaRiego: 'GOTEO', cultivosPreferidos: ['frijol'] });
      const mala = await gql(app, GUARDAR, { id, input: { sistemaRiego: 'TEMPORAL', cultivosPreferidos: ['unicornio'] } });
      expect(codigo(mala)).toBe('VALIDACION_FALLIDA');
      const fila = await prisma.preferencias.findUnique({ where: { parcelaId: id } });
      expect(fila).toMatchObject({ sistemaRiego: 'GOTEO', cultivosPreferidos: ['frijol'] });
    });

    it('valida las reglas que cruzan campos', async () => {
      const cruzado = await gql(app, GUARDAR, { id, input: { sistemaRiego: 'TEMPORAL', cultivosPreferidos: ['maiz'], cultivosExcluidos: ['maiz'] } });
      expect(cruzado.body.errors[0].message).toMatch(/preferidos y los excluidos/);
      const meses = await gql(app, GUARDAR, { id, input: { sistemaRiego: 'TEMPORAL', mesesVaciosDesde: 3 } });
      expect(meses.body.errors[0].message).toMatch(/los dos meses/);
      const agua = await gql(app, GUARDAR, { id, input: { sistemaRiego: 'TEMPORAL', aguaRiegoMm: 100 } });
      expect(agua.body.errors[0].message).toMatch(/temporal no tiene agua de riego/);
      const fuera = await gql(app, GUARDAR, { id, input: { sistemaRiego: 'GOTEO', prioridades: { agua: 101, suelo: 0, erosion: 0, ingreso: 0 } } });
      expect(codigo(fuera)).toBe('VALIDACION_FALLIDA');
    });

    it('guardarHistorial reemplaza el mismo año en vez de duplicarlo', async () => {
      await gql(app, HISTORIAL, { id, input: { anio: 2023, cultivo: 'maiz', descripcion: 'primera' } });
      const res = await gql(app, HISTORIAL, { id, input: { anio: 2023, cultivo: 'avena', descripcion: 'segunda' } });
      expect(res.body.data.guardarHistorial).toMatchObject({ cultivo: 'avena', descripcion: 'segunda' });
      expect(await prisma.historialParcela.count({ where: { parcelaId: id } })).toBe(1);
    });

    it('en una parcela que no existe responde NO_ENCONTRADO y no guarda nada', async () => {
      const fantasma = '99999999-9999-4999-8999-999999999999';
      expect(codigo(await gql(app, HISTORIAL, { id: fantasma, input: { anio: 2023, cultivo: 'maiz' } }))).toBe('NO_ENCONTRADO');
      expect(codigo(await gql(app, GUARDAR, { id: fantasma, input: { sistemaRiego: 'TEMPORAL' } }))).toBe('NO_ENCONTRADO');
    });

    it('eliminarHistorial dice si borró algo', async () => {
      await gql(app, HISTORIAL, { id, input: { anio: 2021, cultivo: 'maiz' } });
      const borrar = `mutation($id: ID!, $anio: Int!) { eliminarHistorial(parcelaId: $id, anio: $anio) }`;
      expect((await gql(app, borrar, { id, anio: 2021 })).body.data.eliminarHistorial).toBe(true);
      expect((await gql(app, borrar, { id, anio: 2021 })).body.data.eliminarHistorial).toBe(false);
    });
  });

  describe('consultas', () => {
    it('parcelas pagina y trae preferencias e historial sin una consulta por parcela', async () => {
      for (let i = 0; i < 3; i++) {
        await gql(app, CREAR, { input: { nombre: `P${i}`, punto: PUNTO, preferencias: { sistemaRiego: 'GOTEO' }, historial: [{ anio: 2020 + i, cultivo: 'maiz' }] } });
      }
      const espiar = jest.spyOn(prisma, '$queryRaw');
      const res = await gql(app, `{ parcelas(limite: 2) { nombre preferencias { sistemaRiego } historial { anio } } }`);
      expect(res.body.data.parcelas).toHaveLength(2);
      expect(res.body.data.parcelas[0].historial).toHaveLength(1);
      expect(res.body.data.parcelas[0].preferencias.sistemaRiego).toBe('GOTEO');
      expect(espiar.mock.calls.length).toBe(1); // una sola consulta SQL cruda para las parcelas, no una por parcela
      espiar.mockRestore();
      expect((await gql(app, `{ parcelas(limite: 500, desplazamiento: 2) { nombre } }`)).body.data.parcelas).toHaveLength(1);
    });

    it('parcela devuelve null si no existe y valida el id', async () => {
      expect((await gql(app, `{ parcela(id: "99999999-9999-4999-8999-999999999999") { id } }`)).body.data.parcela).toBeNull();
      expect(codigo(await gql(app, `{ parcela(id: "no-es-uuid") { id } }`))).toBe('VALIDACION_FALLIDA');
    });
  });
});
