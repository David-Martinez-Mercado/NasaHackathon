import { Args, Query, Resolver } from '@nestjs/graphql';
import { Costoso } from '../common/throttle';
import { RecomendacionInput, RotacionEvaluada, SimulacionInput } from './recomendaciones.model';
import { RecomendacionesService } from './recomendaciones.service';

@Resolver(() => RotacionEvaluada)
export class RecomendacionesResolver {
  constructor(private readonly recomendaciones: RecomendacionesService) {}

  @Costoso()
  @Query(() => [RotacionEvaluada], {
    name: 'recomendaciones',
    description: 'Las 3 mejores rotaciones a 3 años para una parcela.',
  })
  recomendar(@Args('input') input: RecomendacionInput) {
    return this.recomendaciones.evaluar(input.parcelaId, input.escenario);
  }

  /** Para los sliders: recalcula en vivo sin guardar nada. Objetivo: responder en menos de 300 ms. */
  @Costoso()
  @Query(() => [RotacionEvaluada], { description: 'Recalcula con otro escenario de lluvia y temperatura sin guardar.' })
  simularEscenario(@Args('input') input: SimulacionInput) {
    return this.recomendaciones.evaluar(input.parcelaId, input.escenario);
  }
}
