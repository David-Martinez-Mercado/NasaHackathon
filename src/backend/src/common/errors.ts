/** Códigos de error que el frontend puede interpretar (llegan en `extensions.codigo`). */
export enum CodigoError {
  VALIDACION_FALLIDA = 'VALIDACION_FALLIDA',
  NO_ENCONTRADO = 'NO_ENCONTRADO',
  GEOMETRIA_INVALIDA = 'GEOMETRIA_INVALIDA',
  NO_IMPLEMENTADO = 'NO_IMPLEMENTADO',
  LIMITE_EXCEDIDO = 'LIMITE_EXCEDIDO',
  CONSULTA_DEMASIADO_COMPLEJA = 'CONSULTA_DEMASIADO_COMPLEJA',
  FUENTE_NO_DISPONIBLE = 'FUENTE_NO_DISPONIBLE',
  ERROR_INTERNO = 'ERROR_INTERNO',
}

/** Error esperado de la aplicación: el mensaje está en español y se puede mostrar al usuario. */
export class AppError extends Error {
  constructor(
    readonly codigo: CodigoError,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const noEncontrado = (que: string) => new AppError(CodigoError.NO_ENCONTRADO, `No encontramos ${que}.`);
