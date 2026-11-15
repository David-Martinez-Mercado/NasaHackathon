import { Args, ID, Mutation, Resolver } from '@nestjs/graphql';
import { uuidPipe } from '../common/uuid.pipe';
import { Preferencias, PreferenciasInput } from './preferencias.model';
import { PreferenciasService } from './preferencias.service';

@Resolver(() => Preferencias)
export class PreferenciasResolver {
  constructor(private readonly preferencias: PreferenciasService) {}

  @Mutation(() => Preferencias, { description: 'Guarda (o reemplaza) las prioridades y restricciones de una parcela.' })
  guardarPreferencias(
    @Args('parcelaId', { type: () => ID }, uuidPipe()) parcelaId: string,
    @Args('input') input: PreferenciasInput,
  ) {
    return this.preferencias.guardar(parcelaId, input);
  }
}
