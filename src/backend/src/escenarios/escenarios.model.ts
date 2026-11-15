import { Field, Float, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { IsOptional, IsString, IsUUID, MaxLength, Max, Min, IsInt, IsNumber } from 'class-validator';
import { LLUVIA_PCT, RotacionEvaluada, TEMP_DELTA_C } from '../recomendaciones/recomendaciones.model';

@ObjectType()
export class EscenarioGuardado {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  parcelaId: string;

  @Field(() => String, { nullable: true })
  nombre?: string | null;

  @Field(() => Int)
  lluviaPct: number;

  @Field(() => Float)
  tempDeltaC: number;

  @Field(() => [RotacionEvaluada], { description: 'Resultado calculado al guardar el escenario' })
  resultado: RotacionEvaluada[];

  @Field(() => Date)
  creadoEn: Date;
}

@InputType()
export class GuardarEscenarioInput {
  @Field(() => ID)
  @IsUUID('all', { message: 'El identificador de la parcela no es válido.' })
  parcelaId: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'El nombre puede tener hasta 120 caracteres.' })
  nombre?: string;

  @Field(() => Int)
  @IsInt({ message: 'El cambio de lluvia debe ser un número entero.' })
  @Min(LLUVIA_PCT.min)
  @Max(LLUVIA_PCT.max)
  lluviaPct: number;

  @Field(() => Float)
  @IsNumber()
  @Min(TEMP_DELTA_C.min)
  @Max(TEMP_DELTA_C.max)
  tempDeltaC: number;
}
