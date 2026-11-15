import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfig } from './config/config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  const { env } = app.get(AppConfig);
  await app.listen(env.PORT);
  const logger = new Logger('Bootstrap');
  logger.log(`Field Shift API on port ${env.PORT} (${env.NODE_ENV}${env.DEMO_OFFLINE ? ', demo mode' : ''})`);
}

bootstrap().catch((error) => {
  new Logger('Bootstrap').error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
