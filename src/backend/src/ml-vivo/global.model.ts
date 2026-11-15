import { Field, Float, InputType, Int, ObjectType } from '@nestjs/graphql';
import { IsNumber, Max, Min } from 'class-validator';

@InputType()
export class CajaMundoInput {
  @Field(() => Float) @IsNumber() @Min(-180) @Max(180) oeste: number;
  @Field(() => Float) @IsNumber() @Min(-90) @Max(90) sur: number;
  @Field(() => Float) @IsNumber() @Min(-180) @Max(180) este: number;
  @Field(() => Float) @IsNumber() @Min(-90) @Max(90) norte: number;
}

@ObjectType('CeldaClima')
export class CeldaClima {
  @Field(() => Float) latitud: number;
  @Field(() => Float) longitud: number;
  @Field(() => Float, { nullable: true }) tempMediaC?: number | null;
  @Field(() => Float, { nullable: true }) tempMaxC?: number | null;
  @Field(() => Float, { nullable: true }) lluvia7dMm?: number | null;
  @Field(() => Float, { nullable: true }) humedadRelativaPct?: number | null;
  @Field(() => Float, { nullable: true }) humedadSueloPct?: number | null;
  @Field(() => String) datosAl: string;
}

@ObjectType('ClimaGlobal', { description: 'OBSERVED weather of the last week in the visible cells (NASA POWER). These are not predictions: the models only apply in Weld.' })
export class ClimaGlobal {
  @Field(() => [CeldaClima]) celdas: CeldaClima[];
  @Field(() => Int) solicitadas: number;
  @Field(() => Int) faltantes: number;
  @Field(() => Boolean, { description: 'true = the view was very large and only one in several cells is sampled.' }) muestreado: boolean;
  @Field(() => Float) pasoLatitud: number;
  @Field(() => Float) pasoLongitud: number;
  @Field(() => String, { nullable: true }) datosAl?: string | null;
}
