import { ParseUUIDPipe } from '@nestjs/common';
import { AppError, CodigoError } from './errors';

/** Valida que un identificador sea UUID, con un mensaje apto para el usuario. */
export const uuidPipe = () =>
  new ParseUUIDPipe({
    exceptionFactory: () => new AppError(CodigoError.VALIDACION_FALLIDA, 'El identificador no es válido.'),
  });
