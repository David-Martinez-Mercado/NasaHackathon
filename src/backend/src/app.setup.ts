import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppConfig } from './config/config.service';

/** Configuración común del servidor (la usan main.ts y las pruebas e2e). */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfig).env;

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  // El Sandbox de Apollo (solo desarrollo) carga scripts externos, así que la CSP solo se activa en producción.
  app.use(helmet({ contentSecurityPolicy: config.isProduction ? undefined : false }));

  app.enableCors({
    origin: config.corsOrigins.length ? config.corsOrigins : false,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: false,
  });

  if (config.TRUST_PROXY > 0) (app as NestExpressApplication).set('trust proxy', config.TRUST_PROXY);
}
