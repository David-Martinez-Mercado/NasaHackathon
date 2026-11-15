import { AppError, CodigoError } from '../common/errors';

export type Posicion = [number, number];
export type GeometriaGeoJSON =
  | { type: 'Point'; coordinates: Posicion }
  | { type: 'Polygon'; coordinates: Posicion[][] };

export const MAX_ANILLOS = 10;
export const MAX_VERTICES = 2000;

const invalida = (detalle: string) =>
  new AppError(CodigoError.GEOMETRIA_INVALIDA, `The field shape is not valid: ${detalle}.`);

function posicion(valor: unknown): Posicion {
  if (!Array.isArray(valor) || valor.length !== 2 || !valor.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw invalida('each point must be [longitude, latitude]');
  }
  const [lon, lat] = valor as number[];
  if (lon < -180 || lon > 180) throw invalida(`longitude out of range (${lon})`);
  if (lat < -90 || lat > 90) throw invalida(`latitude out of range (${lat})`);
  return [lon, lat];
}

/**
 * Valida una geometría GeoJSON de entrada (solo Point y Polygon, 2D, WGS84).
 * La validez topológica final (anillos que se cruzan, etc.) la revisa PostGIS con ST_IsValid.
 */
export function validarGeometria(valor: unknown): GeometriaGeoJSON {
  if (typeof valor !== 'object' || valor === null) throw invalida('a GeoJSON object was expected');
  const { type, coordinates } = valor as { type?: unknown; coordinates?: unknown };

  if (type === 'Point') return { type, coordinates: posicion(coordinates) };

  if (type === 'Polygon') {
    if (!Array.isArray(coordinates) || coordinates.length < 1 || coordinates.length > MAX_ANILLOS) {
      throw invalida(`a polygon has between 1 and ${MAX_ANILLOS} rings`);
    }
    let vertices = 0;
    const anillos = coordinates.map((anillo: unknown) => {
      if (!Array.isArray(anillo) || anillo.length < 4) throw invalida('each ring needs at least 4 points');
      const puntos = anillo.map(posicion);
      const [primero, ultimo] = [puntos[0], puntos[puntos.length - 1]];
      if (primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) throw invalida('each ring must close at its first point');
      vertices += puntos.length;
      return puntos;
    });
    if (vertices > MAX_VERTICES) throw invalida(`too many points (maximum ${MAX_VERTICES})`);
    return { type, coordinates: anillos };
  }

  throw invalida('only Point and Polygon are accepted');
}

export function punto(latitud: number, longitud: number): GeometriaGeoJSON {
  return validarGeometria({ type: 'Point', coordinates: [longitud, latitud] });
}
