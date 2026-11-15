import { BadRequestException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { GraphQLError } from 'graphql';
import { AppError, CodigoError } from './errors';
import { formatError } from './format-error';

const formatear = (original: unknown, produccion: boolean, extensions: Record<string, unknown> = {}) => {
  const error = new GraphQLError(original instanceof Error ? original.message : 'x', { originalError: original as Error, extensions });
  return formatError(error.toJSON(), error, produccion);
};

describe('formatError', () => {
  it('conserva el código y el mensaje de un AppError', () => {
    const f = formatear(new AppError(CodigoError.NO_ENCONTRADO, 'No encontramos esa parcela.'), true);
    expect(f.extensions?.codigo).toBe('NO_ENCONTRADO');
    expect(f.message).toBe('No encontramos esa parcela.');
  });

  it('baja por errores anidados hasta el AppError original', () => {
    const interno = new GraphQLError('Expected type GeoJSON', { originalError: new AppError(CodigoError.GEOMETRIA_INVALIDA, 'Forma inválida.') });
    const externo = new GraphQLError('Variable $input got invalid value', { originalError: interno });
    const f = formatError(externo.toJSON(), externo, true);
    expect(f.extensions?.codigo).toBe('GEOMETRIA_INVALIDA');
    expect(f.message).toBe('Forma inválida.');
  });

  it('junta los mensajes de class-validator en una sola frase', () => {
    const f = formatear(new BadRequestException(['La latitud no es válida', 'El nombre es muy largo']), true);
    expect(f.extensions?.codigo).toBe('VALIDACION_FALLIDA');
    expect(f.message).toBe('La latitud no es válida. El nombre es muy largo');
  });

  it('traduce el límite de consultas', () => {
    const f = formatear(new ThrottlerException(), true);
    expect(f.extensions?.codigo).toBe('LIMITE_EXCEDIDO');
    expect(f.message).toMatch(/espera/i);
  });

  it('oculta el detalle de errores internos en producción pero no en desarrollo', () => {
    const interno = new Error('relation "Parcela" does not exist');
    const prod = formatear(interno, true, { stacktrace: ['at secreto.ts:1'] });
    expect(prod.extensions?.codigo).toBe('ERROR_INTERNO');
    expect(JSON.stringify(prod)).not.toMatch(/Parcela|secreto/);
    const dev = formatear(interno, false);
    expect(dev.message).toContain('relation "Parcela"');
  });

  it('nunca devuelve la traza', () => {
    const f = formatear(new Error('x'), false, { stacktrace: ['at a'] });
    expect(f.extensions).not.toHaveProperty('stacktrace');
  });
});
