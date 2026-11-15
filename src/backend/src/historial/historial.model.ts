import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Max, Min } from 'class-validator';

@ObjectType()
export class RegistroHistorial {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  parcelaId: string;

  @Field(() => Int)
  anio: number;

  @Field(() => String, { description: 'Código de cultivo (ver query cultivos)' })
  cultivo: string;

  @Field(() => String, { nullable: true, description: 'Fecha de siembra, AAAA-MM-DD' })
  fechaSiembra?: string | null;

  @Field(() => String, { nullable: true })
  descripcion?: string | null;
}

@InputType()
export class HistorialInput {
  @Field(() => Int)
  @IsInt({ message: 'El año debe ser un número entero.' })
  @Min(1950, { message: 'El año no puede ser anterior a 1950.' })
  @Max(2100, { message: 'El año no puede pasar de 2100.' })
  anio: number;

  @Field(() => String)
  @IsString()
  @Matches(/^[a-z0-9_-]{1,40}$/, { message: 'Código de cultivo no válido.' })
  cultivo: string;

  @Field(() => String, { nullable: true, description: 'AAAA-MM-DD' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha de siembra debe tener el formato AAAA-MM-DD.' })
  fechaSiembra?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'La descripción puede tener hasta 1000 caracteres.' })
  descripcion?: string;
}
