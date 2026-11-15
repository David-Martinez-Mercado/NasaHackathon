import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import depthLimit from 'graphql-depth-limit';
import { ComplexityPlugin } from './common/complexity.plugin';
import { formatError } from './common/format-error';
import { GqlThrottlerGuard } from './common/gql-throttler.guard';
import { esCostoso } from './common/throttle';
import { AppConfig, AppConfigModule } from './config/config.service';
import { CultivosModule } from './cultivos/cultivos.module';
import { DatosModule } from './datos/datos.port';
import { EscenariosModule } from './escenarios/escenarios.module';
import { MotorModule } from './motor/motor.port';
import { ParcelasModule } from './parcelas/parcelas.module';
import { PrediccionesModule } from './predicciones/predicciones.module';
import { PreferenciasModule } from './preferencias/preferencias.module';
import { PrismaModule } from './prisma/prisma.module';
import { RecomendacionesModule } from './recomendaciones/recomendaciones.module';
import { SaludModule } from './salud/salud.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.env.THROTTLE_TTL_MS,
            // las operaciones marcadas con @Costoso() tienen un límite más estricto
            limit: (context) => (esCostoso(context) ? config.env.THROTTLE_LIMIT_COSTOSO : config.env.THROTTLE_LIMIT),
          },
        ],
      }),
    }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        const produccion = config.env.isProduction;
        return {
          autoSchemaFile: true, // en memoria; el archivo docs/schema.graphql se exporta con `npm run schema`
          sortSchema: true,
          // Introspección y Sandbox solo en desarrollo
          introspection: !produccion,
          playground: false,
          plugins: [
            produccion
              ? ApolloServerPluginLandingPageDisabled()
              : ApolloServerPluginLandingPageLocalDefault({ embed: true }),
          ],
          csrfPrevention: true,
          includeStacktraceInErrorResponses: false,
          validationRules: [depthLimit(config.env.GRAPHQL_MAX_DEPTH)],
          formatError: (formatted, error) => formatError(formatted, error, produccion),
          context: ({ req, res }: { req: unknown; res: unknown }) => ({ req, res }),
        };
      },
    }),
    MotorModule,
    DatosModule,
    CultivosModule,
    ParcelasModule,
    PreferenciasModule,
    RecomendacionesModule,
    EscenariosModule,
    PrediccionesModule,
    SaludModule,
  ],
  providers: [ComplexityPlugin, { provide: APP_GUARD, useClass: GqlThrottlerGuard }],
})
export class AppModule {}
