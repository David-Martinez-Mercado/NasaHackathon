import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { uuidPipe } from '../common/uuid.pipe';
import { PrioridadesInput } from '../preferencias/preferencias.model';
import { RiesgosService } from './riesgos.service';
import { RiesgosParcelaTipo, SugerenciasCultivoTipo } from './sugerencias.model';
import { SugerenciasService } from './sugerencias.service';

@Resolver()
export class SugerenciasResolver {
  constructor(
    private readonly sugerencias: SugerenciasService,
    private readonly riesgos: RiesgosService,
  ) {}

  @Query(() => SugerenciasCultivoTipo, {
    name: 'sugerenciasCultivo',
    description:
      'Other crops that could be planted in the field, evaluated with the ml/ models (rotation, price, yield, cycle), ' +
      'the area risks and the farmer priorities (the saved ones, or the ones passed in `prioridades` to try without saving). ' +
      'It is not the agronomic rules engine: the water, nitrogen and cover classifications are general.',
  })
  sugerenciasCultivo(
    @Args('parcelaId', { type: () => ID }, uuidPipe()) parcelaId: string,
    @Args('prioridades', { type: () => PrioridadesInput, nullable: true }) prioridades?: PrioridadesInput,
  ) {
    return this.sugerencias.sugerir(
      parcelaId,
      prioridades ? { agua: prioridades.agua, suelo: prioridades.suelo, erosion: prioridades.erosion, ingreso: prioridades.ingreso } : undefined,
    );
  }

  @Query(() => RiesgosParcelaTipo, {
    name: 'riesgosParcela',
    description: 'Risks of the area around the field (heat, drought, soil moisture, stress, vulnerability) with the ml/ models.',
  })
  riesgosParcela(@Args('parcelaId', { type: () => ID }, uuidPipe()) parcelaId: string) {
    return this.riesgos.paraParcela(parcelaId);
  }
}
