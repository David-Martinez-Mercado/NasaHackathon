import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { uuidPipe } from '../common/uuid.pipe';
import { HistorialInput, RegistroHistorial } from './historial.model';
import { HistorialService } from './historial.service';

@Resolver(() => RegistroHistorial)
export class HistorialResolver {
  constructor(private readonly historial: HistorialService) {}

  @Query(() => [RegistroHistorial], { name: 'historial', description: 'Qué se sembró en la parcela cada año (el más reciente primero).' })
  listar(@Args('parcelaId', { type: () => ID }, uuidPipe()) parcelaId: string) {
    return this.historial.listar(parcelaId);
  }

  @Mutation(() => RegistroHistorial, { description: 'Crea o reemplaza el registro de un año del historial de la parcela.' })
  guardarHistorial(
    @Args('parcelaId', { type: () => ID }, uuidPipe()) parcelaId: string,
    @Args('input') input: HistorialInput,
  ) {
    return this.historial.guardar(parcelaId, input);
  }

  @Mutation(() => Boolean, { description: 'Borra el registro de un año. Devuelve false si no existía.' })
  eliminarHistorial(
    @Args('parcelaId', { type: () => ID }, uuidPipe()) parcelaId: string,
    @Args('anio', { type: () => Int }) anio: number,
  ) {
    return this.historial.eliminar(parcelaId, anio);
  }
}
