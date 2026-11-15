import { Field, Float, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum FuenteDato {
  VIVO = 'VIVO',
  LOTE = 'LOTE',
  NO_DISPONIBLE = 'NO_DISPONIBLE',
}
registerEnumType(FuenteDato, {
  name: 'FuenteDato',
  description: 'VIVO = consultado a las API hace un momento; LOTE = del último export de ml/; NO_DISPONIBLE = no se pudo calcular.',
});

@ObjectType('ResultadoVivo')
export class ResultadoVivo {
  @Field(() => String, { description: 'Modelo de ml/: c05b (olas de calor), c08a (lluvia mañana), c08b (lluvia mensual), c04 (humedad)' })
  concepto: string;

  @Field(() => String) titulo: string;
  @Field(() => String) unidad: string;
  @Field(() => String) horizonte: string;
  @Field(() => Boolean) disponible: boolean;
  @Field(() => Float, { nullable: true }) valor?: number | null;
  @Field(() => [Float], { nullable: true, description: 'Un valor por periodo (meses o semanas) cuando aplica.' }) serie?: number[] | null;
  @Field(() => String, { nullable: true, description: 'Fecha del dato más reciente con el que se calculó.' }) datosAl?: string | null;
  @Field(() => String) rol: string;
  @Field(() => String) algoritmo: string;
  @Field(() => Boolean) escenarioAplicado: boolean;
  @Field(() => [String]) notas: string[];
  @Field(() => String, { nullable: true, description: 'Por qué no hay valor (fuera de temporada, modelo no cargado...). Nunca se inventa.' }) motivo?: string | null;
  @Field(() => FuenteDato) fuente: FuenteDato;
}

@ObjectType('PrediccionesVivas')
export class PrediccionesVivas {
  @Field(() => FuenteDato, { description: 'De dónde salen los resultados de esta respuesta.' }) fuente: FuenteDato;
  @Field(() => String, { nullable: true }) datosAl?: string | null;
  @Field(() => Int, { nullable: true, description: 'Antigüedad del dato más reciente, en días.' }) antiguedadDias?: number | null;
  @Field(() => Boolean, { description: 'true = el servicio no pudo refrescar: son datos guardados o del último lote.' }) obsoleto: boolean;
  @Field(() => String, { nullable: true, description: 'Punto de entrenamiento de referencia.' }) sitio?: string | null;
  @Field(() => Float, { nullable: true }) distanciaKm?: number | null;
  @Field(() => Float, { nullable: true }) latenciaMs?: number | null;
  @Field(() => String) generadoEn: string;
  @Field(() => [ResultadoVivo]) resultados: ResultadoVivo[];
  @Field(() => [String]) advertencias: string[];
}
