import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { uuidPipe } from '../common/uuid.pipe';
import { HistorialInput, RegistroHistorial } from './historial.model';
import { HistorialService } from './historial.service';

@Resolver(() => RegistroHistorial)
export class HistorialResolver {
  constructor(private readonly historial: HistorialService) {}

  @Query(() => [RegistroHistorial], { name: 'historial', description: 'What was planted in the field each year (most recent first).' })
  listar(@Args('parcelaId', { type: () => ID }, uuidPipe()) parcelaId: string) {
    return this.historial.listar(parcelaId);
  }

  @Mutation(() => RegistroHistorial, { description: 'Creates or replaces the record of one year in the field history.' })
  guardarHistorial(
    @Args('parcelaId', { type: () => ID }, uuidPipe()) parcelaId: string,
    @Args('input') input: HistorialInput,
  ) {
    return this.historial.guardar(parcelaId, input);
  }

  @Mutation(() => Boolean, { description: 'Deletes the record of a year. Returns false if it did not exist.' })
  eliminarHistorial(
    @Args('parcelaId', { type: () => ID }, uuidPipe()) parcelaId: string,
    @Args('anio', { type: () => Int }) anio: number,
  ) {
    return this.historial.eliminar(parcelaId, anio);
  }
}
