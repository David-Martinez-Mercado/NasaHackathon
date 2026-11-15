import { GraphQLScalarType, Kind, valueFromASTUntyped } from 'graphql';
import { GeometriaGeoJSON, validarGeometria } from './geojson';

/** Geometría GeoJSON (Point o Polygon, WGS84). Se valida al entrar; ver geojson.ts. */
export const GeoJSONScalar = new GraphQLScalarType<GeometriaGeoJSON, object>({
  name: 'GeoJSON',
  description: 'GeoJSON geometry: Point or Polygon in WGS84 (longitude, latitude).',
  serialize: (value) => value as object,
  parseValue: (value) => validarGeometria(value),
  parseLiteral: (ast) => validarGeometria(ast.kind === Kind.OBJECT ? valueFromASTUntyped(ast) : null),
});
