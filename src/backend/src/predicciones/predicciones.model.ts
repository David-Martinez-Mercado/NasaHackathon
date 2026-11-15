import { Field, Float, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Severidad, TipoCapa, TipoPunto } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber } from 'class-validator';
import { JSONScalar } from '../common/json.scalar';

registerEnumType(TipoCapa, { name: 'TipoCapa', description: 'Map layers (the ones in the bottom bar of the app).' });
registerEnumType(TipoPunto, { name: 'TipoPunto' });
registerEnumType(Severidad, { name: 'Severidad' });

@ObjectType()
export class ParadaColor {
  @Field(() => Float, { description: 'Position on the ramp, from 0 to 1' })
  en: number;

  @Field(() => String, { description: '#RRGGBB' })
  color: string;
}

@ObjectType()
export class RejillaCapa {
  @Field(() => [Float], { description: 'oeste, sur, este, norte (grados)' })
  bbox: number[];

  @Field(() => Int)
  columnas: number;

  @Field(() => Int)
  filas: number;

  @Field(() => [Float], { nullable: 'items', description: 'columns × rows values, row by row from the NORTH; null = no data' })
  valores: (number | null)[];
}

@ObjectType()
export class EscenarioAplicado {
  @Field(() => Float)
  lluviaPct: number;

  @Field(() => Float)
  tempDeltaC: number;

  @Field(() => Boolean, { description: 'false = this layer does not change with the sliders (the model uses neither rain nor temperature)' })
  aplica: boolean;

  @Field(() => Boolean, { description: 'true = interpolated between two precomputed scenarios' })
  interpolado: boolean;

  @Field(() => Boolean, { description: 'true = the requested value was outside the computed range and was clipped to the edge' })
  recortado: boolean;
}

@ObjectType('CapaMapa')
export class CapaMapaTipo {
  @Field(() => TipoCapa)
  tipo: TipoCapa;

  @Field(() => String, { description: 'Model from ml/ it comes from (e.g. c05b)' })
  concepto: string;

  @Field(() => String)
  titulo: string;

  @Field(() => String)
  variable: string;

  @Field(() => String)
  unidad: string;

  @Field(() => Float)
  min: number;

  @Field(() => Float)
  max: number;

  @Field(() => [ParadaColor])
  rampa: ParadaColor[];

  @Field(() => [String], { description: 'Labels from top (maximum) to bottom (minimum)' })
  leyenda: string[];

  @Field(() => RejillaCapa)
  rejilla: RejillaCapa;

  @Field(() => EscenarioAplicado)
  escenario: EscenarioAplicado;

  @Field(() => String)
  fuente: string;

  @Field(() => Int, { description: 'Real resolution of the source data, in meters' })
  resolucionM: number;

  @Field(() => Boolean, { description: 'true = the detail inside the field is interpolation, not measured variation' })
  interpolada: boolean;

  @Field(() => String, { description: 'Date of the data, YYYY-MM-DD' })
  datosAl: string;

  @Field(() => [String])
  notas: string[];

  @Field(() => String, { description: 'Version of the ml/ export it comes from' })
  version: string;
}

@ObjectType('PuntoMapa')
export class PuntoMapaTipo {
  @Field(() => String)
  id: string;

  @Field(() => Float)
  latitud: number;

  @Field(() => Float)
  longitud: number;

  @Field(() => TipoPunto)
  tipo: TipoPunto;

  @Field(() => String, { nullable: true })
  etiqueta?: string | null;

  @Field(() => Severidad, { nullable: true })
  severidad?: Severidad | null;

  @Field(() => Float, { nullable: true })
  valor?: number | null;
}

@ObjectType('ConjuntoPuntos')
export class ConjuntoPuntosTipo {
  @Field(() => TipoPunto)
  tipo: TipoPunto;

  @Field(() => String)
  concepto: string;

  @Field(() => String)
  fuente: string;

  @Field(() => String)
  datosAl: string;

  @Field(() => String, { nullable: true })
  unidad?: string | null;

  @Field(() => [String])
  notas: string[];

  @Field(() => [PuntoMapaTipo])
  puntos: PuntoMapaTipo[];
}

@ObjectType()
export class PuntoSerie {
  @Field(() => String)
  etiqueta: string;

  @Field(() => Float, { nullable: true })
  a?: number | null;

  @Field(() => Float, { nullable: true })
  b?: number | null;

  @Field(() => Boolean, { description: 'true = it is a forecast, not an observed value' })
  pronostico: boolean;
}

@ObjectType('SerieDatos')
export class SerieDatosTipo {
  @Field(() => String, { description: 'p. ej. "market:maiz" o "statistics:temperature"' })
  clave: string;

  @Field(() => String)
  titulo: string;

  @Field(() => String)
  unidad: string;

  @Field(() => String)
  fuente: string;

  @Field(() => String, { nullable: true })
  concepto?: string | null;

  @Field(() => String, { nullable: true })
  etiquetaA?: string | null;

  @Field(() => String, { nullable: true })
  etiquetaB?: string | null;

  @Field(() => [String])
  notas: string[];

  @Field(() => [PuntoSerie])
  puntos: PuntoSerie[];
}

@ObjectType('TablaModelo')
export class TablaModeloTipo {
  @Field(() => String, { description: '"rendimiento", "rotacion" o "ciclo"' })
  clave: string;

  @Field(() => String)
  concepto: string;

  @Field(() => String)
  titulo: string;

  @Field(() => String, { nullable: true })
  unidad?: string | null;

  @Field(() => String, { nullable: true })
  datosAl?: string | null;

  @Field(() => [String])
  notas: string[];

  @Field(() => JSONScalar, { description: 'Rows of the table (each one is an object with the columns of that table)' })
  filas: unknown;
}

@ObjectType('AlertaResumen')
export class AlertaResumenTipo {
  @Field(() => String, { description: '"drought" o "stress"' })
  tipo: string;

  @Field(() => String)
  titulo: string;

  @Field(() => Float)
  valor: number;

  @Field(() => String)
  unidad: string;

  @Field(() => String)
  detalle: string;

  @Field(() => String, { description: 'What exactly the value measures' })
  definicion: string;

  @Field(() => String)
  concepto: string;

  @Field(() => String)
  datosAl: string;
}

@ObjectType()
export class ResumenHumedad {
  @Field(() => Float, { description: 'Root-zone moisture (%)' })
  raiz: number;

  @Field(() => Float, { description: 'Surface moisture (%)' })
  superficie: number;

  @Field(() => Float, { description: 'Evapotranspiration flux (MJ/m²/day, EVPTRNS from MERRA-2)' })
  evaporacion: number;

  @Field(() => Float, { description: '0-100: the moisture of the last 28 days against the same days of previous years' })
  percentil: number;

  @Field(() => String)
  datosAl: string;

  @Field(() => String)
  fuente: string;
}

@ObjectType()
export class ResumenClima {
  @Field(() => Float, { nullable: true, description: 'Chance of rain tomorrow (%), model c08a' })
  lluviaMananaPct?: number | null;

  @Field(() => [Float], { description: 'Expected rain in the next 6 months (mm), climatology c08b' })
  lluviaMensualMm: number[];

  @Field(() => Float, { nullable: true, description: 'Chance of a heat wave within 7 days (%); null outside May–September' })
  olaDeCalor7DiasPct?: number | null;

  @Field(() => Float, { nullable: true, description: 'Climatology of the next month (not a forecast)' })
  temperaturaMaxC?: number | null;

  @Field(() => Float, { nullable: true })
  temperaturaMinC?: number | null;

  @Field(() => Float, { nullable: true })
  temperaturaMediaC?: number | null;

  @Field(() => String)
  datosAl: string;

  @Field(() => [String])
  notas: string[];
}

@ObjectType('InfoModelo')
export class InfoModeloTipo {
  @Field(() => String)
  concepto: string;

  @Field(() => String)
  nombre: string;

  @Field(() => String, { description: 'modelo, regla-base o indice' })
  rol: string;

  @Field(() => String)
  algoritmo: string;

  @Field(() => Int)
  filasEntrenamiento: number;

  @Field(() => String)
  metrica: string;

  @Field(() => Float, { nullable: true })
  valor?: number | null;

  @Field(() => Float, { nullable: true, description: 'Lower limit of the 95 % confidence interval' })
  intervaloInf?: number | null;

  @Field(() => Float, { nullable: true })
  intervaloSup?: number | null;

  @Field(() => String, { nullable: true })
  base?: string | null;

  @Field(() => Float, { nullable: true })
  valorBase?: number | null;

  @Field(() => Float, { nullable: true, description: 'Error reduction versus the best baseline (> 0 = it beats it)' })
  skill?: number | null;

  @Field(() => [String])
  notas: string[];
}

@ObjectType('EstadoPredicciones')
export class EstadoPrediccionesTipo {
  @Field(() => String)
  version: string;

  @Field(() => String, { description: 'Most recent date of the data, YYYY-MM-DD' })
  datosAl: string;

  @Field(() => Date)
  generadaEn: Date;

  @Field(() => Date)
  importadaEn: Date;

  @Field(() => [InfoModeloTipo])
  modelos: InfoModeloTipo[];

  @Field(() => [String], { description: 'What you need to know before trusting the predictions' })
  limitaciones: string[];
}

@InputType()
export class CajaInput {
  @Field(() => [Float], { description: 'oeste, sur, este, norte (grados)' })
  @IsArray()
  @ArrayMinSize(4, { message: 'The box needs 4 numbers: west, south, east, north.' })
  @ArrayMaxSize(4, { message: 'The box needs 4 numbers: west, south, east, north.' })
  @IsNumber({}, { each: true })
  bbox: number[];
}
