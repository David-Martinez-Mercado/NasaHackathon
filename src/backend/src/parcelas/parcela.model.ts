import { Field, Float, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { HistorialInput, RegistroHistorial } from '../historial/historial.model';
import { Preferencias, PreferenciasInput } from '../preferencias/preferencias.model';
import { GeometriaGeoJSON } from './geojson';
import { GeoJSONScalar } from './geojson.scalar';

@ObjectType()
export class Parcela {
  @Field(() => ID)
  id: string;

  @Field(() => String, { nullable: true })
  nombre?: string | null;

  @Field(() => String, { nullable: true })
  descripcion?: string | null;

  @Field(() => String, { nullable: true, description: 'Código del cultivo que se siembra hoy' })
  cultivoActual?: string | null;

  @Field(() => Float, { description: 'Latitud del centroide' })
  latitud: number;

  @Field(() => Float, { description: 'Longitud del centroide' })
  longitud: number;

  @Field(() => Float, { nullable: true, description: 'Hectáreas (solo si la parcela es un polígono)' })
  areaHa?: number | null;

  @Field(() => GeoJSONScalar, { description: 'Forma de la parcela (Point o Polygon)' })
  geometria: GeometriaGeoJSON;

  @Field(() => Int, { description: 'Versión para el bloqueo optimista: mándala al actualizar o eliminar' })
  version: number;

  @Field(() => Date)
  creadaEn: Date;

  @Field(() => Date)
  actualizadaEn: Date;

  @Field(() => Preferencias, { nullable: true })
  preferencias?: Preferencias | null;

  @Field(() => [RegistroHistorial])
  historial?: RegistroHistorial[];
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
  @Field(() => String, {
    nullable: true,
    description:
      'Clave que genera el cliente (p. ej. un UUID). Si la creación se repite con la misma clave, no se duplica: ' +
      'se devuelve la parcela ya creada.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'La clave de idempotencia necesita al menos 8 caracteres.' })
  @MaxLength(80, { message: 'La clave de idempotencia puede tener hasta 80 caracteres.' })
  @Matches(/^[A-Za-z0-9_.:-]+$/, { message: 'La clave de idempotencia solo usa letras, números y . _ : -' })
  claveIdempotencia?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'El nombre puede tener hasta 120 caracteres.' })
  nombre?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'La descripción puede tener hasta 500 caracteres.' })
  descripcion?: string;

  @Field(() => String, { nullable: true, description: 'Código de cultivo (ver query cultivos)' })
  @IsOptional()
  @Matches(/^[a-z0-9_-]{1,40}$/, { message: 'Código de cultivo no válido.' })
  cultivoActual?: string;

  @Field(() => PuntoInput, { nullable: true, description: 'Usa punto o poligono, no ambos.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PuntoInput)
  punto?: PuntoInput;

  @Field(() => GeoJSONScalar, { nullable: true, description: 'Polígono GeoJSON (longitud, latitud).' })
  @IsOptional()
  poligono?: GeometriaGeoJSON;

  @Field(() => PreferenciasInput, { nullable: true, description: 'Se guardan junto con la parcela, en la misma transacción.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PreferenciasInput)
  preferencias?: PreferenciasInput;

  @Field(() => [HistorialInput], { nullable: true, description: 'Años ya sembrados; si uno falla, no se crea nada.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60, { message: 'Máximo 60 años de historial.' })
  @ValidateNested({ each: true })
  @Type(() => HistorialInput)
  historial?: HistorialInput[];
}

@InputType()
export class ActualizarParcelaInput {
  @Field(() => Int, { description: 'La versión de la parcela que el cliente leyó. Si cambió, la actualización se rechaza.' })
  @IsInt({ message: 'La versión debe ser un número entero.' })
  @Min(1)
  version: number;

  @Field(() => String, { nullable: true, description: 'Omitido = no cambia; null = borrar' })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'El nombre puede tener hasta 120 caracteres.' })
  nombre?: string | null;

  @Field(() => String, { nullable: true, description: 'Omitido = no cambia; null = borrar' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'La descripción puede tener hasta 500 caracteres.' })
  descripcion?: string | null;

  @Field(() => String, { nullable: true, description: 'Omitido = no cambia; null = borrar' })
  @IsOptional()
  @Matches(/^[a-z0-9_-]{1,40}$/, { message: 'Código de cultivo no válido.' })
  cultivoActual?: string | null;

  @Field(() => PuntoInput, { nullable: true, description: 'Nueva ubicación como punto (no se combina con poligono).' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PuntoInput)
  punto?: PuntoInput;

  @Field(() => GeoJSONScalar, { nullable: true, description: 'Nueva forma como polígono (no se combina con punto).' })
  @IsOptional()
  poligono?: GeometriaGeoJSON;

  @Field(() => PreferenciasInput, {
    nullable: true,
    description: 'Reemplaza las preferencias de la parcela, en la misma transacción que el resto de los cambios.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PreferenciasInput)
  preferencias?: PreferenciasInput;
}
