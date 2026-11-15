import { Plugin } from '@nestjs/apollo';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server';
import { fieldExtensionsEstimator, getComplexity, simpleEstimator } from 'graphql-query-complexity';
import { AppConfig } from '../config/config.service';
import { AppError, CodigoError } from './errors';

/** Rechaza consultas cuyo costo estimado supera GRAPHQL_MAX_COMPLEXITY (cada campo cuesta 1 por defecto). */
@Plugin()
export class ComplexityPlugin implements ApolloServerPlugin {
  constructor(
    private readonly schemaHost: GraphQLSchemaHost,
    private readonly config: AppConfig,
  ) {}

  async requestDidStart(): Promise<GraphQLRequestListener<any>> {
    const { schema } = this.schemaHost;
    const maximo = this.config.env.GRAPHQL_MAX_COMPLEXITY;
    return {
      async didResolveOperation({ request, document }) {
        const complejidad = getComplexity({
          schema,
          operationName: request.operationName,
          query: document,
          variables: request.variables,
          estimators: [fieldExtensionsEstimator(), simpleEstimator({ defaultComplexity: 1 })],
        });
        if (complejidad > maximo) {
          throw new AppError(
            CodigoError.CONSULTA_DEMASIADO_COMPLEJA,
            `The query is too heavy (${complejidad}, maximum ${maximo}). Ask for less data at a time.`,
          );
        }
      },
    };
  }
}
