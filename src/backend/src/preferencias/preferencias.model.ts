import { Field, Float, ID, InputType, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Prioridad } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

registerEnumType(Prioridad, {
  name: 'Prioridad',
  description: 'Qué le importa más al agricultor al elegir una rotación.',
});

@ObjectType()
export class Preferencias {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  parcelaId: string;

  @Field(() => Boolean, { description: 'true = riego, false = temporal' })
  riego: boolean;

  @Field(() => Float, { nullable: true, description: 'Agua de riego disponible por ciclo (mm)' })
  aguaRiegoMm?: number | null;

  @Field(() => [String])
  maquinaria: string[];

  @Field(() => [String], { description: 'Códigos de cultivo (ver query cultivos)' })
  cultivosPreferidos: string[];

  @Field(() => [String])
  cultivosExcluidos: string[];

  @Field(() => Prioridad)
  prioridad: Prioridad;

  @Field(() => Date)
  actualizadaEn: Date;
}

const CODIGO = /^[a-z0-9_-]{1,40}$/;

@InputType()
export class PreferenciasInput {
  @Field(() => Boolean)
  @IsBoolean({ message: 'Indica si la parcela es de riego o de temporal.' })
  riego: boolean;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber({}, { message: 'El agua de riego debe ser un número.' })
  @Min(0, { message: 'El agua de riego no puede ser negativa.' })
  @Max(5000, { message: 'El agua de riego es demasiado alta (máximo 5000 mm).' })
  aguaRiegoMm?: number;

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

  @Field(() => Prioridad, { nullable: true, defaultValue: Prioridad.BALANCE })
  @IsOptional()
  @IsEnum(Prioridad, { message: 'La prioridad debe ser AGUA, SUELO, INGRESO o BALANCE.' })
  prioridad?: Prioridad;
}
