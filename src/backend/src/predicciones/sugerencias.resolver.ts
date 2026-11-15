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
      'Otros cultivos que se podrían sembrar en la parcela, evaluados con los modelos de ml/ (rotación, precio, rendimiento, ciclo), ' +
      'los riesgos de la zona y las prioridades del agricultor (las guardadas, o las que se pasen en `prioridades` para probar sin guardar). ' +
      'No es el motor de reglas agronómicas: las clasificaciones de agua, nitrógeno y cobertura son generales.',
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
    description: 'Riesgos de la zona de la parcela (calor, sequía, humedad del suelo, estrés, vulnerabilidad) con los modelos de ml/.',
  })
  riesgosParcela(@Args('parcelaId', { type: () => ID }, uuidPipe()) parcelaId: string) {
    return this.riesgos.paraParcela(parcelaId);
  }
}
