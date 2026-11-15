import { Field, Float, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { SistemaRiego, TipoSuelo } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

registerEnumType(SistemaRiego, { name: 'SistemaRiego', description: 'Cómo se riega la parcela (TEMPORAL = sin riego).' });
registerEnumType(TipoSuelo, { name: 'TipoSuelo', description: 'Tipo de suelo que percibe el agricultor; SATELITAL = usar el dato satelital.' });

@ObjectType()
export class Prioridades {
  @Field(() => Int, { description: 'Ahorrar agua / tolerar la sequía (0-100)' })
  agua: number;

  @Field(() => Int, { description: 'Mejorar la fertilidad y el suelo (0-100)' })
  suelo: number;

  @Field(() => Int, { description: 'Detener la erosión del suelo (0-100)' })
  erosion: number;

  @Field(() => Int, { description: 'Generar ingreso extra (0-100)' })
  ingreso: number;
}

@ObjectType()
export class Preferencias {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  parcelaId: string;

  @Field(() => SistemaRiego)
  sistemaRiego: SistemaRiego;

  @Field(() => Boolean, { description: 'true si hay algún sistema de riego (cualquiera distinto de TEMPORAL)' })
  riego: boolean;

  @Field(() => Float, { nullable: true, description: 'Agua de riego disponible por ciclo (mm)' })
  aguaRiegoMm?: number | null;

  @Field(() => TipoSuelo)
  tipoSuelo: TipoSuelo;

  @Field(() => Int, { nullable: true, description: 'Mes (1-12) desde el que la parcela queda vacía' })
  mesesVaciosDesde?: number | null;

  @Field(() => Int, { nullable: true, description: 'Mes (1-12) hasta el que la parcela queda vacía' })
  mesesVaciosHasta?: number | null;

  @Field(() => [String])
  maquinaria: string[];

  @Field(() => [String], { description: 'Códigos de cultivo (ver query cultivos)' })
  cultivosPreferidos: string[];

  @Field(() => [String])
  cultivosExcluidos: string[];

  @Field(() => Prioridades)
  prioridades: Prioridades;

  @Field(() => Date)
  actualizadaEn: Date;
}

const CODIGO = /^[a-z0-9_-]{1,40}$/;
const prioridad = { min: 0, max: 100 };

@InputType()
export class PrioridadesInput {
  @Field(() => Int, { defaultValue: 50 })
  @IsInt({ message: 'Cada prioridad es un número entero de 0 a 100.' })
  @Min(prioridad.min, { message: 'Las prioridades van de 0 a 100.' })
  @Max(prioridad.max, { message: 'Las prioridades van de 0 a 100.' })
  agua: number;

  @Field(() => Int, { defaultValue: 50 })
  @IsInt({ message: 'Cada prioridad es un número entero de 0 a 100.' })
  @Min(prioridad.min, { message: 'Las prioridades van de 0 a 100.' })
  @Max(prioridad.max, { message: 'Las prioridades van de 0 a 100.' })
  suelo: number;

  @Field(() => Int, { defaultValue: 50 })
  @IsInt({ message: 'Cada prioridad es un número entero de 0 a 100.' })
  @Min(prioridad.min, { message: 'Las prioridades van de 0 a 100.' })
  @Max(prioridad.max, { message: 'Las prioridades van de 0 a 100.' })
  erosion: number;

  @Field(() => Int, { defaultValue: 50 })
  @IsInt({ message: 'Cada prioridad es un número entero de 0 a 100.' })
  @Min(prioridad.min, { message: 'Las prioridades van de 0 a 100.' })
  @Max(prioridad.max, { message: 'Las prioridades van de 0 a 100.' })
  ingreso: number;
}

@InputType()
export class PreferenciasInput {
  @Field(() => SistemaRiego, { defaultValue: SistemaRiego.TEMPORAL })
  @IsEnum(SistemaRiego, { message: 'El sistema de riego debe ser TEMPORAL, GRAVEDAD, ASPERSION o GOTEO.' })
  sistemaRiego: SistemaRiego;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber({}, { message: 'El agua de riego debe ser un número.' })
  @Min(0, { message: 'El agua de riego no puede ser negativa.' })
  @Max(5000, { message: 'El agua de riego es demasiado alta (máximo 5000 mm).' })
  aguaRiegoMm?: number;

  @Field(() => TipoSuelo, { defaultValue: TipoSuelo.SATELITAL })
  @IsEnum(TipoSuelo, { message: 'El tipo de suelo debe ser ARCILLOSO, ARENOSO, FRANCO o SATELITAL.' })
  tipoSuelo: TipoSuelo;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'El mes va de 1 (enero) a 12 (diciembre).' })
  @Max(12, { message: 'El mes va de 1 (enero) a 12 (diciembre).' })
  mesesVaciosDesde?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'El mes va de 1 (enero) a 12 (diciembre).' })
  @Max(12, { message: 'El mes va de 1 (enero) a 12 (diciembre).' })
  mesesVaciosHasta?: number;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20, { message: 'Máximo 20 máquinas.' })
  @IsString({ each: true })
  @Matches(CODIGO, { each: true, message: 'Los nombres de maquinaria usan minúsculas, números, guion o guion bajo.' })
  maquinaria?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @Matches(CODIGO, { each: true, message: 'Código de cultivo no válido.' })
  cultivosPreferidos?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @Matches(CODIGO, { each: true, message: 'Código de cultivo no válido.' })
  cultivosExcluidos?: string[];

  @Field(() => PrioridadesInput, { nullable: true, description: 'Sin indicar = 50 en cada una' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PrioridadesInput)
  prioridades?: PrioridadesInput;
}
