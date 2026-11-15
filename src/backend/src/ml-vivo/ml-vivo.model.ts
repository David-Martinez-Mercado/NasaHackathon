import { Field, Float, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum FuenteDato {
  VIVO = 'VIVO',
  LOTE = 'LOTE',
  NO_DISPONIBLE = 'NO_DISPONIBLE',
}
registerEnumType(FuenteDato, {
  name: 'FuenteDato',
  description: 'VIVO = queried from the APIs a moment ago; LOTE = from the last ml/ export; NO_DISPONIBLE = could not be calculated.',
});

@ObjectType('ResultadoVivo')
export class ResultadoVivo {
  @Field(() => String, { description: 'Model from ml/: c05b (heat waves), c08a (rain tomorrow), c08b (monthly rain), c04 (moisture)' })
  concepto: string;

  @Field(() => String) titulo: string;
  @Field(() => String) unidad: string;
  @Field(() => String) horizonte: string;
  @Field(() => Boolean) disponible: boolean;
  @Field(() => Float, { nullable: true }) valor?: number | null;
  @Field(() => [Float], { nullable: true, description: 'One value per period (months or weeks) when it applies.' }) serie?: number[] | null;
  @Field(() => String, { nullable: true, description: 'Date of the most recent data it was calculated with.' }) datosAl?: string | null;
  @Field(() => String) rol: string;
  @Field(() => String) algoritmo: string;
  @Field(() => Boolean) escenarioAplicado: boolean;
  @Field(() => [String]) notas: string[];
  @Field(() => String, { nullable: true, description: 'Why there is no value (out of season, model not loaded...). It is never made up.' }) motivo?: string | null;
  @Field(() => FuenteDato) fuente: FuenteDato;
}

@ObjectType('PrediccionesVivas')
export class PrediccionesVivas {
  @Field(() => FuenteDato, { description: 'Where the results of this response come from.' }) fuente: FuenteDato;
  @Field(() => String, { nullable: true }) datosAl?: string | null;
  @Field(() => Int, { nullable: true, description: 'Age of the most recent data, in days.' }) antiguedadDias?: number | null;
  @Field(() => Boolean, { description: 'true = the service could not refresh: this is saved data or from the last batch.' }) obsoleto: boolean;
  @Field(() => String, { nullable: true, description: 'Reference training point.' }) sitio?: string | null;
  @Field(() => Float, { nullable: true }) distanciaKm?: number | null;
  @Field(() => Float, { nullable: true }) latenciaMs?: number | null;
  @Field(() => String) generadoEn: string;
  @Field(() => [ResultadoVivo]) resultados: ResultadoVivo[];
  @Field(() => [String]) advertencias: string[];
}
