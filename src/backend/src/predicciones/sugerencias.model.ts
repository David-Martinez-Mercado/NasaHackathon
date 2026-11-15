import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { Prioridades } from '../preferencias/preferencias.model';

@ObjectType('RiesgoZona', {
  description:
    'A risk of the area around the field, calculated with an ml/ model at the field point. The levels use thresholds ' +
    'provisional ([TO VERIFY] with the agronomist): they are for comparing, not for deciding.',
})
export class RiesgoZonaTipo {
  @Field(() => String, { description: 'calor | sequia | humedad | estres | vulnerabilidad | erosion | pendiente | elevacion | lluvia' })
  clave: string;

  @Field(() => String, { nullable: true, description: 'BAJO | MEDIO | ALTO (low | medium | high). null = no data or informational only (rain).' })
  nivel?: string | null;

  @Field(() => Float, { nullable: true })
  valor?: number | null;

  @Field(() => String)
  unidad: string;

  @Field(() => String, { description: 'Model from ml/ it comes from, e.g. c05b' })
  modelo: string;

  @Field(() => String, { nullable: true })
  datosAl?: string | null;

  @Field(() => Int, { nullable: true, description: 'Cell size of the data, in meters.' })
  resolucionM?: number | null;

  @Field(() => Boolean, { nullable: true, description: 'true = the detail inside the field is interpolation.' })
  interpolada?: boolean | null;

  @Field(() => Int, { nullable: true, description: 'Only estres: points evaluated inside the radius.' })
  puntosCercanos?: number | null;

  @Field(() => Int, { nullable: true, description: 'Only estres: how many of them are critical.' })
  puntosCriticos?: number | null;

  @Field(() => Int, { nullable: true, description: 'Only estres: search radius in km.' })
  radioKm?: number | null;
}

@ObjectType('RiesgosParcela')
export class RiesgosParcelaTipo {
  @Field(() => [RiesgoZonaTipo])
  riesgos: RiesgoZonaTipo[];

  @Field(() => [String], { description: 'Limits that must be shown next to the risks.' })
  advertencias: string[];
}

@ObjectType('AporteCultivo', { description: 'How much a criterion contributes to a crop score.' })
export class AporteCultivoTipo {
  @Field(() => String, { description: 'ingreso | suelo | agua | erosion | local' })
  factor: string;

  @Field(() => Int, { description: '0–100: how well the crop does on this criterion.' })
  puntaje: number;

  @Field(() => Float, { description: 'Effective weight of the criterion (already with priorities and area risks).' })
  peso: number;

  @Field(() => Boolean, { description: 'true = there is no data for this criterion for the crop: it counts as neutral (50), nothing is made up.' })
  sinDato: boolean;
}

@ObjectType('SugerenciaCultivo', {
  description: 'A crop evaluated with the ml/ models, the area risks and the farmer priorities.',
})
export class SugerenciaCultivoTipo {
  @Field(() => String, { description: 'Catalog code (cultivos query); it can be saved as cultivoActual.' })
  cultivo: string;

  @Field(() => String)
  nombre: string;

  @Field(() => Int, { description: '0–100. Relative order among the options, not a probability of success.' })
  puntaje: number;

  @Field(() => [AporteCultivoTipo], { description: 'The score broken down by criterion.' })
  aportes: AporteCultivoTipo[];

  @Field(() => Float, { nullable: true, description: '% of the Weld cropland pixels that had the base crop the previous year and planted this one (c02, CDL).' })
  probabilidadSiguientePct?: number | null;

  @Field(() => Float, { nullable: true, description: '% change of the price between the latest data and the last forecast month (c10, exploratory).' })
  cambioPrecioPct?: number | null;

  @Field(() => String, { nullable: true })
  unidadPrecio?: string | null;

  @Field(() => Float, { nullable: true, description: 'Estimated county yield in t/ha (c01). Only maize and winter wheat.' })
  rendimientoTHa?: number | null;

  @Field(() => Float, { nullable: true, description: 'Historical county yield in t/ha, to compare with the estimate.' })
  rendimientoHistoricoTHa?: number | null;

  @Field(() => Int, { nullable: true, description: 'Days from planting to harvest, 10-year median (c07). Few crops have data.' })
  cicloDias?: number | null;

  @Field(() => Boolean, { nullable: true, description: 'true = a different botanical family than the base crop. null if unknown.' })
  otraFamilia?: boolean | null;

  @Field(() => Boolean, { description: 'Fixes nitrogen (legume). General classification [TO VERIFY].' })
  fijaNitrogeno: boolean;

  @Field(() => String, { description: 'baja | media | alta (low | medium | high). General classification [TO VERIFY].' })
  demandaAgua: string;

  @Field(() => String, { description: 'baja | media | alta (low | medium | high; soil cover against erosion). General classification [TO VERIFY].' })
  coberturaSuelo: string;

  @Field(() => Boolean, { description: 'The farmer marked it as preferred.' })
  preferido: boolean;
}

@ObjectType('PesosEvaluacion', { description: 'Effective weight of each criterion after applying priorities and area risks.' })
export class PesosEvaluacionTipo {
  @Field(() => Float) agua: number;
  @Field(() => Float) suelo: number;
  @Field(() => Float) erosion: number;
  @Field(() => Float) ingreso: number;
  @Field(() => Float, { description: 'Observed local practice (c02); fixed, low weight.' }) local: number;
}

@ObjectType('SugerenciasCultivo')
export class SugerenciasCultivoTipo {
  @Field(() => String, { nullable: true, description: 'Crop it is calculated from (the current one or the last in the history).' })
  cultivoBase?: string | null;

  @Field(() => String, { nullable: true, description: '"actual" or "historial". null if there is none.' })
  origenBase?: string | null;

  @Field(() => SugerenciaCultivoTipo, { nullable: true, description: 'The base crop evaluated with the same criteria, to compare.' })
  actual?: SugerenciaCultivoTipo | null;

  @Field(() => [SugerenciaCultivoTipo])
  sugerencias: SugerenciaCultivoTipo[];

  @Field(() => Prioridades, { description: 'The priorities it was calculated with (the saved ones or the ones tried).' })
  prioridades: Prioridades;

  @Field(() => PesosEvaluacionTipo)
  pesos: PesosEvaluacionTipo;

  @Field(() => [String], { description: 'Codes of the risk adjustments: agua_riesgo | agua_riego | erosion_vulnerabilidad.' })
  ajustes: string[];

  @Field(() => [RiesgoZonaTipo])
  riesgos: RiesgoZonaTipo[];

  @Field(() => String)
  metodo: string;

  @Field(() => Boolean, { description: 'false = the water, nitrogen and cover classifications are general and not verified yet.' })
  rasgosVerificados: boolean;

  @Field(() => [String])
  advertencias: string[];
}
