import { Field, Float, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Severidad, TipoCapa, TipoPunto } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber } from 'class-validator';
import { JSONScalar } from '../common/json.scalar';

registerEnumType(TipoCapa, { name: 'TipoCapa', description: 'Capas del mapa (las de la barra inferior de la app).' });
registerEnumType(TipoPunto, { name: 'TipoPunto' });
registerEnumType(Severidad, { name: 'Severidad' });

@ObjectType()
export class ParadaColor {
  @Field(() => Float, { description: 'Posición en la rampa, de 0 a 1' })
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

  @Field(() => [Float], { nullable: 'items', description: 'columnas × filas valores, fila por fila desde el NORTE; null = sin dato' })
  valores: (number | null)[];
}

@ObjectType()
export class EscenarioAplicado {
  @Field(() => Float)
  lluviaPct: number;

  @Field(() => Float)
  tempDeltaC: number;

  @Field(() => Boolean, { description: 'false = esta capa no cambia con los sliders (el modelo no usa lluvia ni temperatura)' })
  aplica: boolean;

  @Field(() => Boolean, { description: 'true = se interpoló entre dos escenarios precalculados' })
  interpolado: boolean;

  @Field(() => Boolean, { description: 'true = el valor pedido estaba fuera del rango calculado y se recortó al borde' })
  recortado: boolean;
}

@ObjectType('CapaMapa')
export class CapaMapaTipo {
  @Field(() => TipoCapa)
  tipo: TipoCapa;

  @Field(() => String, { description: 'Modelo de ml/ del que sale (p. ej. c05b)' })
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

  @Field(() => [String], { description: 'Etiquetas de arriba (máximo) hacia abajo (mínimo)' })
  leyenda: string[];

  @Field(() => RejillaCapa)
  rejilla: RejillaCapa;

  @Field(() => EscenarioAplicado)
  escenario: EscenarioAplicado;

  @Field(() => String)
  fuente: string;

  @Field(() => Int, { description: 'Resolución real del dato de origen, en metros' })
  resolucionM: number;

  @Field(() => Boolean, { description: 'true = el detalle dentro de la parcela es interpolación, no variación medida' })
  interpolada: boolean;

  @Field(() => String, { description: 'Fecha de los datos, AAAA-MM-DD' })
  datosAl: string;

  @Field(() => [String])
  notas: string[];

  @Field(() => String, { description: 'Versión del export de ml/ de la que sale' })
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

  @Field(() => Boolean, { description: 'true = es un pronóstico, no un dato observado' })
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

  @Field(() => JSONScalar, { description: 'Filas de la tabla (cada una es un objeto con las columnas de esa tabla)' })
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

  @Field(() => String, { description: 'Qué mide exactamente el valor' })
  definicion: string;

  @Field(() => String)
  concepto: string;

  @Field(() => String)
  datosAl: string;
}

@ObjectType()
export class ResumenHumedad {
  @Field(() => Float, { description: 'Humedad de la zona de raíces (%)' })
  raiz: number;

  @Field(() => Float, { description: 'Humedad de la superficie (%)' })
  superficie: number;

  @Field(() => Float, { description: 'Flujo de evapotranspiración (MJ/m²/día, EVPTRNS de MERRA-2)' })
  evaporacion: number;

  @Field(() => Float, { description: '0-100: la humedad de los últimos 28 días contra los mismos días de años anteriores' })
  percentil: number;

  @Field(() => String)
  datosAl: string;

  @Field(() => String)
  fuente: string;
}

@ObjectType()
export class ResumenClima {
  @Field(() => Float, { nullable: true, description: 'Probabilidad de lluvia mañana (%), modelo c08a' })
  lluviaMananaPct?: number | null;

  @Field(() => [Float], { description: 'Lluvia esperada en los próximos 6 meses (mm), climatología c08b' })
  lluviaMensualMm: number[];

  @Field(() => Float, { nullable: true, description: 'Probabilidad de ola de calor en 7 días (%); null fuera de mayo–septiembre' })
  olaDeCalor7DiasPct?: number | null;

  @Field(() => Float, { nullable: true, description: 'Climatología del próximo mes (no es un pronóstico)' })
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

  @Field(() => Float, { nullable: true, description: 'Límite inferior del intervalo de confianza al 95 %' })
  intervaloInf?: number | null;

  @Field(() => Float, { nullable: true })
  intervaloSup?: number | null;

  @Field(() => String, { nullable: true })
  base?: string | null;

  @Field(() => Float, { nullable: true })
  valorBase?: number | null;

  @Field(() => Float, { nullable: true, description: 'Reducción del error frente a la mejor base (> 0 = la supera)' })
  skill?: number | null;

  @Field(() => [String])
  notas: string[];
}

@ObjectType('EstadoPredicciones')
export class EstadoPrediccionesTipo {
  @Field(() => String)
  version: string;

  @Field(() => String, { description: 'Fecha más reciente de los datos, AAAA-MM-DD' })
  datosAl: string;

  @Field(() => Date)
  generadaEn: Date;

  @Field(() => Date)
  importadaEn: Date;

  @Field(() => [InfoModeloTipo])
  modelos: InfoModeloTipo[];

  @Field(() => [String], { description: 'Lo que hay que saber antes de fiarse de las predicciones' })
  limitaciones: string[];
}

@InputType()
export class CajaInput {
  @Field(() => [Float], { description: 'oeste, sur, este, norte (grados)' })
  @IsArray()
  @ArrayMinSize(4, { message: 'La caja necesita 4 números: oeste, sur, este, norte.' })
  @ArrayMaxSize(4, { message: 'La caja necesita 4 números: oeste, sur, este, norte.' })
  @IsNumber({}, { each: true })
  bbox: number[];
}
