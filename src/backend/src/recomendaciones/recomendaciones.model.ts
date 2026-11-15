import { Field, Float, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export enum SemaforoGql {
  VERDE = 'VERDE',
  AMARILLO = 'AMARILLO',
  ROJO = 'ROJO',
}
registerEnumType(SemaforoGql, { name: 'Semaforo', description: 'Verde ≥ 70, amarillo 40–69, rojo < 40.' });

/** Rangos de los sliders de la convocatoria (lluvia ±%, temperatura ±°C). */
export const LLUVIA_PCT = { min: -100, max: 100 } as const;
export const TEMP_DELTA_C = { min: -10, max: 10 } as const;

@ObjectType()
export class Puntajes {
  @Field(() => Float) agua: number;
  @Field(() => Float) suelo: number;
  @Field(() => Float) riesgo: number;
  @Field(() => Float) global: number;
}

@ObjectType()
export class Semaforos {
  @Field(() => SemaforoGql) agua: SemaforoGql;
  @Field(() => SemaforoGql) suelo: SemaforoGql;
  @Field(() => SemaforoGql) riesgo: SemaforoGql;
  @Field(() => SemaforoGql) global: SemaforoGql;
}

@ObjectType()
export class RotacionEvaluada {
  @Field(() => [String], { description: 'Cultivo de cada uno de los 3 años (códigos)' })
  anios: string[];

  @Field(() => Puntajes)
  puntajes: Puntajes;

  @Field(() => Semaforos)
  semaforos: Semaforos;

  @Field(() => String, { description: 'Por qué conviene, en lenguaje sencillo' })
  explicacion: string;

  @Field(() => [String], { description: 'Dónde importa el criterio del agricultor o del técnico' })
  criterioHumano: string[];
}

@InputType()
export class EscenarioInput {
  @Field(() => Int, { description: 'Cambio de lluvia en %, de -100 a 100' })
  @IsInt({ message: 'El cambio de lluvia debe ser un número entero.' })
  @Min(LLUVIA_PCT.min, { message: 'La lluvia no puede bajar más de 100 %.' })
  @Max(LLUVIA_PCT.max, { message: 'El cambio de lluvia no puede pasar de +100 %.' })
  lluviaPct: number;

  @Field(() => Float, { description: 'Cambio de temperatura en °C, de -10 a 10' })
  @IsNumber({}, { message: 'El cambio de temperatura debe ser un número.' })
  @Min(TEMP_DELTA_C.min, { message: 'El cambio de temperatura no puede bajar de -10 °C.' })
  @Max(TEMP_DELTA_C.max, { message: 'El cambio de temperatura no puede pasar de +10 °C.' })
  tempDeltaC: number;
}

@InputType()
export class RecomendacionInput {
  @Field(() => ID)
  @IsUUID('all', { message: 'El identificador de la parcela no es válido.' })
  parcelaId: string;

  @Field(() => EscenarioInput, { nullable: true, description: 'Sin escenario = condiciones normales' })
  @IsOptional()
  @ValidateNested()
  @Type(() => EscenarioInput)
  escenario?: EscenarioInput;
}

@InputType()
export class SimulacionInput {
  @Field(() => ID)
  @IsUUID('all', { message: 'El identificador de la parcela no es válido.' })
  parcelaId: string;

  @Field(() => EscenarioInput)
  @ValidateNested()
  @Type(() => EscenarioInput)
  escenario: EscenarioInput;
}
