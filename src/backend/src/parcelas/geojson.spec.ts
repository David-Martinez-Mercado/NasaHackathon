import { AppError, CodigoError } from '../common/errors';
import { MAX_VERTICES, punto, validarGeometria } from './geojson';

const cuadro = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]];

describe('validarGeometria', () => {
  it('acepta un punto y un polígono cerrado', () => {
    expect(validarGeometria({ type: 'Point', coordinates: [-104.71, 40.42] })).toEqual({ type: 'Point', coordinates: [-104.71, 40.42] });
    expect(validarGeometria({ type: 'Polygon', coordinates: cuadro }).type).toBe('Polygon');
  });

  it('punto() usa el orden GeoJSON: longitud primero', () => {
    expect(punto(40.42, -104.71)).toEqual({ type: 'Point', coordinates: [-104.71, 40.42] });
  });

  it.each([
    ['nulo', null],
    ['texto', 'Point'],
    ['tipo no soportado', { type: 'LineString', coordinates: [[0, 0], [1, 1]] }],
    ['punto con 3 coordenadas', { type: 'Point', coordinates: [0, 0, 5] }],
    ['longitud fuera de rango', { type: 'Point', coordinates: [181, 0] }],
    ['latitud fuera de rango', { type: 'Point', coordinates: [0, -91] }],
    ['coordenada que no es número', { type: 'Point', coordinates: ['0', 0] }],
    ['coordenada infinita', { type: 'Point', coordinates: [Infinity, 0] }],
    ['anillo sin cerrar', { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0.5, 0.5]]] }],
    ['anillo con menos de 4 puntos', { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] }],
    ['polígono sin anillos', { type: 'Polygon', coordinates: [] }],
  ])('rechaza %s', (_nombre, valor) => {
    expect(() => validarGeometria(valor)).toThrow(AppError);
    try {
      validarGeometria(valor);
    } catch (error) {
      expect((error as AppError).codigo).toBe(CodigoError.GEOMETRIA_INVALIDA);
    }
  });

  it('rechaza polígonos con demasiados puntos', () => {
    const anillo: number[][] = [];
    for (let i = 0; i < MAX_VERTICES; i++) anillo.push([i / 100000, (i % 7) / 100000]);
    anillo.push(anillo[0]);
    expect(() => validarGeometria({ type: 'Polygon', coordinates: [anillo] })).toThrow(/too many points/);
  });
});
