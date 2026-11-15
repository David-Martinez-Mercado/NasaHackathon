import { Global, Injectable, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Env, validateEnv } from './env';

/** Acceso tipado a la configuración ya validada. */
@Injectable()
export class AppConfig {
  readonly env: Env;

  constructor(config: ConfigService) {
    // ConfigModule ya validó y convirtió los valores; se leen una sola vez.
    this.env = Object.assign(new Env(), {
      NODE_ENV: config.get('NODE_ENV'),
      PORT: config.get('PORT'),
      DATABASE_URL: config.get('DATABASE_URL'),
      CORS_ORIGIN: config.get('CORS_ORIGIN'),
      DEMO_OFFLINE: config.get('DEMO_OFFLINE'),
      TRUST_PROXY: config.get('TRUST_PROXY'),
      RESOURCES_DIR: config.get('RESOURCES_DIR'),
      GRAPHQL_MAX_DEPTH: config.get('GRAPHQL_MAX_DEPTH'),
      GRAPHQL_MAX_COMPLEXITY: config.get('GRAPHQL_MAX_COMPLEXITY'),
      THROTTLE_TTL_MS: config.get('THROTTLE_TTL_MS'),
      THROTTLE_LIMIT: config.get('THROTTLE_LIMIT'),
      THROTTLE_LIMIT_COSTOSO: config.get('THROTTLE_LIMIT_COSTOSO'),
      ML_SERVICE_URL: config.get('ML_SERVICE_URL'),
      ML_SERVICE_TOKEN: config.get('ML_SERVICE_TOKEN'),
      ML_SERVICE_TIMEOUT_MS: config.get('ML_SERVICE_TIMEOUT_MS'),
      ML_SERVICE_BREAKER_FAILURES: config.get('ML_SERVICE_BREAKER_FAILURES'),
      ML_SERVICE_BREAKER_RESET_MS: config.get('ML_SERVICE_BREAKER_RESET_MS'),
    });
  }
}

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv, ignoreEnvFile: false })],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class AppConfigModule {}
