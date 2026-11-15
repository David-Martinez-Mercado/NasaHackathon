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

  @Field(() => String, { description: 'Crop code (see the cultivos query)' })
  cultivo: string;

  @Field(() => String, { nullable: true, description: 'Planting date, YYYY-MM-DD' })
  fechaSiembra?: string | null;

  @Field(() => String, { nullable: true })
  descripcion?: string | null;
}

@InputType()
export class HistorialInput {
  @Field(() => Int)
  @IsInt({ message: 'The year must be a whole number.' })
  @Min(1950, { message: 'The year cannot be earlier than 1950.' })
  @Max(2100, { message: 'The year cannot be later than 2100.' })
  anio: number;

  @Field(() => String)
  @IsString()
  @Matches(/^[a-z0-9_-]{1,40}$/, { message: 'Invalid crop code.' })
  cultivo: string;

  @Field(() => String, { nullable: true, description: 'AAAA-MM-DD' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'The planting date must have the format YYYY-MM-DD.' })
  fechaSiembra?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'The description can have up to 1000 characters.' })
  descripcion?: string;
}
