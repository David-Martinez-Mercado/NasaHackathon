/**
 * Exporta el esquema GraphQL a docs/schema.graphql sin necesidad de base de datos.
 * Uso: npm run schema
 */
import './schema-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { lexicographicSortSchema, printSchema } from 'graphql';
import { CultivosResolver } from '../src/cultivos/cultivos.resolver';
import { EscenariosResolver } from '../src/escenarios/escenarios.resolver';
import { HistorialResolver } from '../src/historial/historial.resolver';
import { ParcelasResolver } from '../src/parcelas/parcelas.resolver';
import { SugerenciasResolver } from '../src/predicciones/sugerencias.resolver';
import { MlVivoResolver } from '../src/ml-vivo/ml-vivo.resolver';
import { PrediccionesResolver } from '../src/predicciones/predicciones.resolver';
import { PreferenciasResolver } from '../src/preferencias/preferencias.resolver';
import { RecomendacionesResolver } from '../src/recomendaciones/recomendaciones.resolver';
import { SaludResolver } from '../src/salud/salud.resolver';

async function main() {
  const app = await NestFactory.create(GraphQLSchemaBuilderModule, { logger: false });
  await app.init();
  const fabrica = app.get(GraphQLSchemaFactory);
  const schema = await fabrica.create([
    CultivosResolver,
    ParcelasResolver,
    PreferenciasResolver,
    HistorialResolver,
    PrediccionesResolver, SugerenciasResolver, MlVivoResolver,
    RecomendacionesResolver,
    EscenariosResolver,
    SaludResolver,
  ]);
  const destino = resolve(process.argv[2] ?? resolve(__dirname, '../../../docs/schema.graphql'));
  mkdirSync(dirname(destino), { recursive: true });
  const encabezado = '# Generated with `npm run schema` in src/backend/. Do not edit by hand.\n\n';
  writeFileSync(destino, encabezado + printSchema(lexicographicSortSchema(schema)) + '\n', 'utf8');
  console.log(`Esquema escrito en ${destino}`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
