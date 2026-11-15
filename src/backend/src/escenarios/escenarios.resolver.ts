import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Costoso } from '../common/throttle';
import { uuidPipe } from '../common/uuid.pipe';
import { EscenarioGuardado, GuardarEscenarioInput } from './escenarios.model';
import { EscenariosService } from './escenarios.service';

@Resolver(() => EscenarioGuardado)
export class EscenariosResolver {
  constructor(private readonly servicio: EscenariosService) {}

  @Costoso()
  @Mutation(() => EscenarioGuardado, { description: 'Calculates and saves a rain and temperature scenario.' })
  guardarEscenario(@Args('input') input: GuardarEscenarioInput) {
    return this.servicio.guardar(input);
  }

  @Query(() => [EscenarioGuardado], {
    name: 'escenarios',
    description: 'Saved scenarios of a field (the 50 most recent).',
  })
  listar(@Args('parcelaId', { type: () => ID }, uuidPipe()) parcelaId: string) {
    return this.servicio.listar(parcelaId);
  }
}
