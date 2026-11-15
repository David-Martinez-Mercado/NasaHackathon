import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Rate limiting que entiende GraphQL (el contexto HTTP vive dentro del contexto GraphQL). */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    if (context.getType<string>() === 'graphql') {
      const ctx = GqlExecutionContext.create(context).getContext<{ req: unknown; res: unknown }>();
      return { req: ctx.req as Record<string, any>, res: ctx.res as Record<string, any> };
    }
    const http = context.switchToHttp();
    return { req: http.getRequest(), res: http.getResponse() };
  }
}
