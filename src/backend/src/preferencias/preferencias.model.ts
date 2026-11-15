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

registerEnumType(SistemaRiego, { name: 'SistemaRiego', description: 'How the field is irrigated (TEMPORAL = rainfed).' });
registerEnumType(TipoSuelo, { name: 'TipoSuelo', description: 'Soil type perceived by the farmer; SATELITAL = use the satellite data.' });

@ObjectType()
export class Prioridades {
  @Field(() => Int, { description: 'Save water / tolerate drought (0-100)' })
  agua: number;

  @Field(() => Int, { description: 'Improve fertility and soil (0-100)' })
  suelo: number;

  @Field(() => Int, { description: 'Stop soil erosion (0-100)' })
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

  @Field(() => Boolean, { description: 'true if there is any irrigation system (anything other than TEMPORAL)' })
  riego: boolean;

  @Field(() => Float, { nullable: true, description: 'Irrigation water available per cycle (mm)' })
  aguaRiegoMm?: number | null;

  @Field(() => TipoSuelo)
  tipoSuelo: TipoSuelo;

  @Field(() => Int, { nullable: true, description: 'Month (1-12) from which the field is left empty' })
  mesesVaciosDesde?: number | null;

  @Field(() => Int, { nullable: true, description: 'Month (1-12) until which the field is left empty' })
  mesesVaciosHasta?: number | null;

  @Field(() => [String])
  maquinaria: string[];

  @Field(() => [String], { description: 'Crop codes (see the cultivos query)' })
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
  @IsInt({ message: 'Each priority is a whole number from 0 to 100.' })
  @Min(prioridad.min, { message: 'Priorities range from 0 to 100.' })
  @Max(prioridad.max, { message: 'Priorities range from 0 to 100.' })
  agua: number;

  @Field(() => Int, { defaultValue: 50 })
  @IsInt({ message: 'Each priority is a whole number from 0 to 100.' })
  @Min(prioridad.min, { message: 'Priorities range from 0 to 100.' })
  @Max(prioridad.max, { message: 'Priorities range from 0 to 100.' })
  suelo: number;

  @Field(() => Int, { defaultValue: 50 })
  @IsInt({ message: 'Each priority is a whole number from 0 to 100.' })
  @Min(prioridad.min, { message: 'Priorities range from 0 to 100.' })
  @Max(prioridad.max, { message: 'Priorities range from 0 to 100.' })
  erosion: number;

  @Field(() => Int, { defaultValue: 50 })
  @IsInt({ message: 'Each priority is a whole number from 0 to 100.' })
  @Min(prioridad.min, { message: 'Priorities range from 0 to 100.' })
  @Max(prioridad.max, { message: 'Priorities range from 0 to 100.' })
  ingreso: number;
}

@InputType()
export class PreferenciasInput {
  @Field(() => SistemaRiego, { defaultValue: SistemaRiego.TEMPORAL })
  @IsEnum(SistemaRiego, { message: 'The irrigation system must be TEMPORAL, GRAVEDAD, ASPERSION or GOTEO.' })
  sistemaRiego: SistemaRiego;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber({}, { message: 'The irrigation water must be a number.' })
  @Min(0, { message: 'The irrigation water cannot be negative.' })
  @Max(5000, { message: 'The irrigation water is too high (maximum 5000 mm).' })
  aguaRiegoMm?: number;

  @Field(() => TipoSuelo, { defaultValue: TipoSuelo.SATELITAL })
  @IsEnum(TipoSuelo, { message: 'The soil type must be ARCILLOSO, ARENOSO, FRANCO or SATELITAL.' })
  tipoSuelo: TipoSuelo;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'The month goes from 1 (January) to 12 (December).' })
  @Max(12, { message: 'The month goes from 1 (January) to 12 (December).' })
  mesesVaciosDesde?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'The month goes from 1 (January) to 12 (December).' })
  @Max(12, { message: 'The month goes from 1 (January) to 12 (December).' })
  mesesVaciosHasta?: number;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20, { message: 'Maximum 20 machines.' })
  @IsString({ each: true })
  @Matches(CODIGO, { each: true, message: 'Machinery names use lowercase letters, numbers, hyphen or underscore.' })
  maquinaria?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @Matches(CODIGO, { each: true, message: 'Invalid crop code.' })
  cultivosPreferidos?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @Matches(CODIGO, { each: true, message: 'Invalid crop code.' })
  cultivosExcluidos?: string[];

  @Field(() => PrioridadesInput, { nullable: true, description: 'Not provided = 50 for each one' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PrioridadesInput)
  prioridades?: PrioridadesInput;
}
