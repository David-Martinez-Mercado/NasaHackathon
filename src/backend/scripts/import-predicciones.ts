/**
 * Importa un export de ml/ (carpeta con manifest.json) a PostgreSQL en una sola transacción.
 *
 *   npm run import:predicciones -- ../../ml/deploy/exports/v1            # importa y activa
 *   npm run import:predicciones -- ../../ml/deploy/exports/v1 --sin-activar
 *
 * Valida hashes y esquema ANTES de escribir; si algo falla en medio de la escritura no queda nada de esa versión y
 * sigue activa la anterior. Necesita DATABASE_URL (y las migraciones aplicadas).
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppConfigModule } from '../src/config/config.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { ImportacionService } from '../src/predicciones/importacion.service';
import { Module } from '@nestjs/common';

@Module({ imports: [AppConfigModule, PrismaModule], providers: [ImportacionService] })
class ImportarModule {}

async function main() {
  const args = process.argv.slice(2);
  const carpeta = args.find((a) => !a.startsWith('--'));
  if (!carpeta) {
    console.error('Usage: npm run import:predicciones -- <export-folder> [--sin-activar]');
    process.exit(2);
  }
  const app = await NestFactory.createApplicationContext(ImportarModule, { logger: ['error', 'warn', 'log'] });
  try {
    const resultado = await app.get(ImportacionService).importar(carpeta, { activar: !args.includes('--sin-activar') });
    console.log(JSON.stringify(resultado, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(`Nothing was imported: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
