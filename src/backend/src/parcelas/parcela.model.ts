import { Field, Float, ID, InputType, ObjectType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Preferencias } from '../preferencias/preferencias.model';
import { GeometriaGeoJSON } from './geojson';
import { GeoJSONScalar } from './geojson.scalar';

@ObjectType()
export class Parcela {
  @Field(() => ID)
  id: string;

  @Field(() => String, { nullable: true })
  nombre?: string | null;

  @Field(() => Float, { description: 'Latitud del centroide' })
  latitud: number;

  @Field(() => Float, { description: 'Longitud del centroide' })
  longitud: number;

  @Field(() => GeoJSONScalar, { description: 'Forma de la parcela (Point o Polygon)' })
  geometria: GeometriaGeoJSON;

  @Field(() => Date)
  creadaEn: Date;

  @Field(() => Preferencias, { nullable: true })
  preferencias?: Preferencias | null;
}

@InputType()
export class PuntoInput {
  @Field(() => Float)
  @IsLatitude({ message: 'La latitud debe estar entre -90 y 90.' })
  latitud: number;

  @Field(() => Float)
  @IsLongitude({ message: 'La longitud debe estar entre -180 y 180.' })
  longitud: number;
}

@InputType()
export class CrearParcelaInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'El nombre puede tener hasta 120 caracteres.' })
  nombre?: string;

  @Field(() => PuntoInput, { nullable: true, description: 'Usa punto o poligono, no ambos.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PuntoInput)
  punto?: PuntoInput;

  @Field(() => GeoJSONScalar, { nullable: true, description: 'Polígono GeoJSON (longitud, latitud).' })
  @IsOptional()
  poligono?: GeometriaGeoJSON;
}
