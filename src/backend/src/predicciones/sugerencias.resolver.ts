import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { uuidPipe } from '../common/uuid.pipe';
import { SugerenciasCultivoTipo } from './sugerencias.model';
import { SugerenciasService } from './sugerencias.service';

@Resolver()
export class SugerenciasResolver {
  constructor(private readonly sugerencias: SugerenciasService) {}

  @Query(() => SugerenciasCultivoTipo, {
    name: 'sugerenciasCultivo',
    description:
      'Otros cultivos que se podrían sembrar en la parcela, ordenados con datos de ml/ (rotación observada, precio esperado) ' +
      'y una regla general de rotación. No es el motor de reglas agronómicas: no usa agua, suelo ni maquinaria.',
  })
  sugerenciasCultivo(@Args('parcelaId', { type: () => ID }, uuidPipe()) parcelaId: string) {
    return this.sugerencias.sugerir(parcelaId);
  }
}
