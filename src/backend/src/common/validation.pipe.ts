import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

/**
 * ValidationPipe de Nest convierte un valor nulo en `{}` y lo valida como si faltaran todos sus campos, lo que rompe los
 * argumentos opcionales de GraphQL (`capa(tipo: LLUVIA)` sin escenario). GraphQL ya garantiza que los argumentos
 * obligatorios no lleguen nulos, así que aquí un nulo simplemente se deja pasar; lo que sí llega se valida igual.
 */
export class ValidationPipeGraphql extends ValidationPipe {
  override async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    if (value === undefined || value === null) return value;
    return super.transform(value, metadata);
  }
}
