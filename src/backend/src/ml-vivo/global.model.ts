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

@ObjectType('ClimaGlobal', { description: 'Clima OBSERVADO de la última semana en las celdas visibles (NASA POWER). No son predicciones: los modelos solo valen en Weld.' })
export class ClimaGlobal {
  @Field(() => [CeldaClima]) celdas: CeldaClima[];
  @Field(() => Int) solicitadas: number;
  @Field(() => Int) faltantes: number;
  @Field(() => Boolean, { description: 'true = la vista era muy grande y se muestrea una de cada varias celdas.' }) muestreado: boolean;
  @Field(() => Float) pasoLatitud: number;
  @Field(() => Float) pasoLongitud: number;
  @Field(() => String, { nullable: true }) datosAl?: string | null;
}
