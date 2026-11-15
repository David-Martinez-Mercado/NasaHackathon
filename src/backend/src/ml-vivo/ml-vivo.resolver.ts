import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { Costoso } from '../common/throttle';
import { uuidPipe } from '../common/uuid.pipe';
import { EscenarioInput } from '../recomendaciones/recomendaciones.model';
import { PrediccionesVivas } from './ml-vivo.model';
import { MlVivoService } from './ml-vivo.service';

@Resolver()
export class MlVivoResolver {
  constructor(private readonly vivo: MlVivoService) {}

  /** Cada llamada puede consultar APIs externas: usa el límite de operaciones caras. */
  @Costoso()
  @Query(() => PrediccionesVivas, {
    name: 'prediccionesEnVivo',
    description:
      'Predicciones de los modelos de ml/ con datos recién consultados a NASA POWER para el punto de la parcela (olas de calor, lluvia, ' +
      'humedad del suelo). Si el servicio no responde devuelve el último lote marcado como LOTE y obsoleto. Con `escenario` aplica los sliders.',
  })
  prediccionesEnVivo(
    @Args('parcelaId', { type: () => ID }, uuidPipe()) parcelaId: string,
    @Args('escenario', { type: () => EscenarioInput, nullable: true }) escenario?: EscenarioInput,
  ) {
    return this.vivo.predecir(parcelaId, escenario ?? undefined);
  }
}
