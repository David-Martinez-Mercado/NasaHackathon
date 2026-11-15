import { ExecutionContext, SetMetadata } from '@nestjs/common';

const COSTOSO = 'fieldshift:costoso';

/** Marca una operación cara (motor de reglas, IA): usa el límite THROTTLE_LIMIT_COSTOSO en vez del general. */
export const Costoso = () => SetMetadata(COSTOSO, true);

export const esCostoso = (context: ExecutionContext): boolean =>
  Reflect.getMetadata(COSTOSO, context.getHandler()) === true;
