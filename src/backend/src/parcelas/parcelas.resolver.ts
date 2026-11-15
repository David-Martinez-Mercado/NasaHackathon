import { Args, ID, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { uuidPipe } from '../common/uuid.pipe';
import { Preferencias } from '../preferencias/preferencias.model';
import { PreferenciasService } from '../preferencias/preferencias.service';
import { CrearParcelaInput, Parcela } from './parcela.model';
import { ParcelaFila, ParcelasService } from './parcelas.service';

@Resolver(() => Parcela)
export class ParcelasResolver {
  constructor(
    private readonly parcelas: ParcelasService,
    private readonly preferenciasService: PreferenciasService,
  ) {}

  @Query(() => Parcela, { nullable: true, description: 'Una parcela por su id (null si no existe).' })
  parcela(@Args('id', { type: () => ID }, uuidPipe()) id: string) {
    return this.parcelas.buscar(id);
  }

  @Mutation(() => Parcela, { description: 'Crea una parcela a partir de un punto o de un polígono GeoJSON.' })
  crearParcela(@Args('input') input: CrearParcelaInput) {
    return this.parcelas.crear(input);
  }

  @ResolveField('preferencias', () => Preferencias, { nullable: true })
  resolverPreferencias(@Parent() parcela: ParcelaFila) {
    return this.preferenciasService.buscar(parcela.id);
  }
}
