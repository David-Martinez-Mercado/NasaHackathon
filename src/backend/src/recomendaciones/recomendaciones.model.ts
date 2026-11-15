import { Field, Float, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export enum SemaforoGql {
  VERDE = 'VERDE',
  AMARILLO = 'AMARILLO',
  ROJO = 'ROJO',
}
registerEnumType(SemaforoGql, { name: 'Semaforo', description: 'Green ≥ 70, yellow 40–69, red < 40.' });

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
  @Field(() => [String], { description: 'Crop of each of the 3 years (codes)' })
  anios: string[];

  @Field(() => Puntajes)
  puntajes: Puntajes;

  @Field(() => Semaforos)
  semaforos: Semaforos;

  @Field(() => String, { description: 'Why it is a good option, in plain language' })
  explicacion: string;

  @Field(() => [String], { description: 'Where the judgment of the farmer or technician matters' })
  criterioHumano: string[];
}

@InputType()
export class EscenarioInput {
  @Field(() => Int, { description: 'Rain change in %, from -100 to 100' })
  @IsInt({ message: 'The rain change must be a whole number.' })
  @Min(LLUVIA_PCT.min, { message: 'Rain cannot drop by more than 100 %.' })
  @Max(LLUVIA_PCT.max, { message: 'The rain change cannot exceed +100 %.' })
  lluviaPct: number;

  @Field(() => Float, { description: 'Temperature change in °C, from -10 to 10' })
  @IsNumber({}, { message: 'The temperature change must be a number.' })
  @Min(TEMP_DELTA_C.min, { message: 'The temperature change cannot go below -10 °C.' })
  @Max(TEMP_DELTA_C.max, { message: 'The temperature change cannot exceed +10 °C.' })
  tempDeltaC: number;
}

@InputType()
export class RecomendacionInput {
  @Field(() => ID)
  @IsUUID('all', { message: 'The field identifier is not valid.' })
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
  @IsUUID('all', { message: 'The field identifier is not valid.' })
  parcelaId: string;

  @Field(() => EscenarioInput)
  @ValidateNested()
  @Type(() => EscenarioInput)
  escenario: EscenarioInput;
}
