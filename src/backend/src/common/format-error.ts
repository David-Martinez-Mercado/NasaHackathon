import { HttpException, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { GraphQLError, GraphQLFormattedError } from 'graphql';
import { AppError, CodigoError } from './errors';

const logger = new Logger('GraphQL');

const MENSAJE_INTERNO = 'An unexpected error occurred. Please try again in a moment.';

/**
 * Convierte cualquier error en una respuesta con `extensions.codigo` y a message in English.
 * En producción nunca se devuelven trazas ni mensajes internos.
 */
export function formatError(formatted: GraphQLFormattedError, error: unknown, production: boolean): GraphQLFormattedError {
  // graphql-js envuelve los errores de variables y escalares en varios GraphQLError: se baja hasta el original
  let original: unknown = error;
  while (original instanceof GraphQLError && original.originalError) original = original.originalError;
  if (original instanceof GraphQLError) original = null;
  const base = { ...formatted, extensions: { ...(formatted.extensions ?? {}) } as Record<string, unknown> };
  delete base.extensions.stacktrace;
  const con = (codigo: CodigoError, message: string): GraphQLFormattedError => ({
    message,
    locations: formatted.locations,
    path: formatted.path,
    extensions: { ...base.extensions, codigo },
  });

  if (original instanceof AppError) return con(original.codigo, original.message);

  if (original instanceof ThrottlerException) {
    return con(CodigoError.LIMITE_EXCEDIDO, 'You made too many requests in a row. Wait a moment and try again.');
  }

  if (original instanceof HttpException && original.getStatus() === 400) {
    const response = original.getResponse() as { message?: string | string[] };
    const message = Array.isArray(response?.message) ? response.message.join('. ') : (response?.message ?? original.message);
    return con(CodigoError.VALIDACION_FALLIDA, message);
  }

  const code = base.extensions.code;
  if (code === 'GRAPHQL_VALIDATION_FAILED' || code === 'BAD_USER_INPUT' || code === 'GRAPHQL_PARSE_FAILED') {
    // Errores de la consulta en sí (campo que no existe, variable con tipo incorrecto, profundidad excedida...)
    return con(
      /profundidad|depth/i.test(formatted.message) ? CodigoError.CONSULTA_DEMASIADO_COMPLEJA : CodigoError.VALIDACION_FALLIDA,
      production ? 'The query is not valid.' : formatted.message,
    );
  }

  if (original instanceof Error) logger.error(original.message, original.stack);
  return con(CodigoError.ERROR_INTERNO, production ? MENSAJE_INTERNO : formatted.message);
}
