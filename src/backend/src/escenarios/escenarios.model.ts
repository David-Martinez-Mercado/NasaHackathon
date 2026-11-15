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

  @Field(() => [RotacionEvaluada], { description: 'Result calculated when the scenario was saved' })
  resultado: RotacionEvaluada[];

  @Field(() => Date)
  creadoEn: Date;
}

@InputType()
export class GuardarEscenarioInput {
  @Field(() => ID)
  @IsUUID('all', { message: 'The field identifier is not valid.' })
  parcelaId: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'The name can have up to 120 characters.' })
  nombre?: string;

  @Field(() => Int)
  @IsInt({ message: 'The rain change must be a whole number.' })
  @Min(LLUVIA_PCT.min)
  @Max(LLUVIA_PCT.max)
  lluviaPct: number;

  @Field(() => Float)
  @IsNumber()
  @Min(TEMP_DELTA_C.min)
  @Max(TEMP_DELTA_C.max)
  tempDeltaC: number;
}
