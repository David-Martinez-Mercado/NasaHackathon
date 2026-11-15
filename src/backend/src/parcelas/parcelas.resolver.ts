import { Args, ID, Int, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { uuidPipe } from '../common/uuid.pipe';
import { RegistroHistorial } from '../historial/historial.model';
import { HistorialService } from '../historial/historial.service';
import { Preferencias } from '../preferencias/preferencias.model';
import { PreferenciasService } from '../preferencias/preferencias.service';
import { ActualizarParcelaInput, CrearParcelaInput, Parcela } from './parcela.model';
import { ParcelaFila, ParcelasService } from './parcelas.service';

@Resolver(() => Parcela)
export class ParcelasResolver {
  constructor(
    private readonly parcelas: ParcelasService,
    private readonly preferenciasService: PreferenciasService,
    private readonly historialService: HistorialService,
  ) {}

  @Query(() => Parcela, { nullable: true, description: 'Una parcela por su id (null si no existe).' })
  parcela(@Args('id', { type: () => ID }, uuidPipe()) id: string) {
    return this.parcelas.buscar(id);
  }

  @Query(() => [Parcela], { name: 'parcelas', description: 'Las parcelas más recientes primero (máximo 100 por página).' })
  listar(
    @Args('limite', { type: () => Int, defaultValue: 50 }) limite: number,
    @Args('desplazamiento', { type: () => Int, defaultValue: 0 }) desplazamiento: number,
  ) {
    return this.parcelas.listar(Math.min(Math.max(limite, 1), 100), Math.max(desplazamiento, 0));
  }

  @Mutation(() => Parcela, {
    description:
      'Crea una parcela con sus preferencias e historial en una sola transacción (todo o nada). ' +
      'Con claveIdempotencia se puede reintentar sin duplicar.',
  })
  crearParcela(@Args('input') input: CrearParcelaInput) {
    return this.parcelas.crear(input);
  }

  @Mutation(() => Parcela, { description: 'Cambia datos de la parcela. Rechaza el cambio si la versión ya no es la actual.' })
  actualizarParcela(
    @Args('id', { type: () => ID }, uuidPipe()) id: string,
    @Args('input') input: ActualizarParcelaInput,
  ) {
    return this.parcelas.actualizar(id, input);
  }

  @Mutation(() => Boolean, { description: 'Elimina la parcela y todo lo suyo. Exige la versión que el cliente vio.' })
  eliminarParcela(
    @Args('id', { type: () => ID }, uuidPipe()) id: string,
    @Args('version', { type: () => Int }) version: number,
  ) {
    return this.parcelas.eliminar(id, version);
  }

  @ResolveField('preferencias', () => Preferencias, { nullable: true })
  resolverPreferencias(@Parent() parcela: ParcelaFila) {
    return parcela.preferencias !== undefined ? parcela.preferencias : this.preferenciasService.buscar(parcela.id);
  }

  @ResolveField('historial', () => [RegistroHistorial])
  resolverHistorial(@Parent() parcela: ParcelaFila) {
    return parcela.historial ?? this.historialService.listar(parcela.id);
  }
}
