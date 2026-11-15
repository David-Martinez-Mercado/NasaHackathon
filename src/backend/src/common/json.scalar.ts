import { GraphQLScalarType, Kind, ValueNode, valueFromASTUntyped } from 'graphql';

/** Valor JSON cualquiera. Solo se usa para salidas pequeñas con forma variable (filas de las tablas de modelos). */
export const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON value (objects, lists, numbers, text).',
  serialize: (valor) => valor,
  parseValue: (valor) => valor,
  parseLiteral: (ast: ValueNode) => (ast.kind === Kind.NULL ? null : valueFromASTUntyped(ast)),
});
