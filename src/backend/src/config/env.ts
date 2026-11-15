import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, Min, ValidateIf, validateSync } from 'class-validator';

const toBool = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? ['true', '1', 'yes', 'si', 'sí'].includes(value.toLowerCase()) : value;

/** Variables de entorno del servidor. Todo lo configurable entra por aquí (las reglas del proyecto: portabilidad). */
export class Env {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @Transform(({ value }) => (value === undefined || value === '' ? 3000 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty({ message: 'DATABASE_URL is required' })
  DATABASE_URL: string;

  /** Orígenes permitidos para CORS, separados por comas. Vacío = ninguno (solo mismo origen). */
  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string = '';

  @Transform(toBool)
  @IsBoolean()
  DEMO_OFFLINE: boolean = true;

  /** Cuántos proxies hay delante (Caddy, túnel). Sin esto el rate limiting vería la IP del proxy, no la del cliente. */
  @Transform(({ value }) => (value === undefined || value === '' ? 0 : Number(value)))
  @IsInt()
  @Min(0)
  @Max(5)
  TRUST_PROXY: number = 0;

  @IsOptional()
  @IsString()
  RESOURCES_DIR?: string;

  @Transform(({ value }) => (value === undefined || value === '' ? 6 : Number(value)))
  @IsInt()
  @Min(2)
  @Max(12)
  GRAPHQL_MAX_DEPTH: number = 6;

  @Transform(({ value }) => (value === undefined || value === '' ? 400 : Number(value)))
  @IsInt()
  @Min(10)
  GRAPHQL_MAX_COMPLEXITY: number = 400;

  @Transform(({ value }) => (value === undefined || value === '' ? 60000 : Number(value)))
  @IsInt()
  @Min(1000)
  THROTTLE_TTL_MS: number = 60000;

  @Transform(({ value }) => (value === undefined || value === '' ? 120 : Number(value)))
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = 120;

  @Transform(({ value }) => (value === undefined || value === '' ? 20 : Number(value)))
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT_COSTOSO: number = 20;

  /** Servicio de predicciones en vivo de ml/ (FastAPI). Sin URL, `prediccionesEnVivo` usa siempre el último lote. */
  @Transform(({ value }) => (value === '' ? undefined : value))
  @ValidateIf((o: Env) => o.ML_SERVICE_URL !== undefined)
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] }, { message: 'ML_SERVICE_URL must be an http(s) URL' })
  ML_SERVICE_URL?: string;

  /** Secreto compartido con el servicio (cabecera X-ML-Token). Nunca viaja al navegador. */
  @IsOptional()
  @IsString()
  ML_SERVICE_TOKEN?: string;

  @Transform(({ value }) => (value === undefined || value === '' ? 20000 : Number(value)))
  @IsInt()
  @Min(500)
  ML_SERVICE_TIMEOUT_MS: number = 20000;

  @Transform(({ value }) => (value === undefined || value === '' ? 3 : Number(value)))
  @IsInt()
  @Min(1)
  ML_SERVICE_BREAKER_FAILURES: number = 3;

  @Transform(({ value }) => (value === undefined || value === '' ? 30000 : Number(value)))
  @IsInt()
  @Min(100)
  ML_SERVICE_BREAKER_RESET_MS: number = 30000;

  get isProduction(): boolean {
    return this.NODE_ENV === 'production';
  }

  get corsOrigins(): string[] {
    return (this.CORS_ORIGIN ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
}

/** Valida y convierte las variables de entorno; falla al arrancar con un mensaje claro si algo falta. */
export function validateEnv(config: Record<string, unknown>): Env {
  const env = plainToInstance(Env, config, { enableImplicitConversion: false });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const detalle = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('; ');
    throw new Error(`Invalid configuration (${detalle})`);
  }
  return env;
}
