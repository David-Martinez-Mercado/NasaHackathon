import { GraphQLScalarType, Kind, valueFromASTUntyped } from 'graphql';
import { GeometriaGeoJSON, validarGeometria } from './geojson';

/** Geometría GeoJSON (Point o Polygon, WGS84). Se valida al entrar; ver geojson.ts. */
export const GeoJSONScalar = new GraphQLScalarType<GeometriaGeoJSON, object>({
  name: 'GeoJSON',
  description: 'Geometría GeoJSON: Point o Polygon en WGS84 (longitud, latitud).',
  serialize: (value) => value as object,
  parseValue: (value) => validarGeometria(value),
  parseLiteral: (ast) => validarGeometria(ast.kind === Kind.OBJECT ? valueFromASTUntyped(ast) : null),
});
