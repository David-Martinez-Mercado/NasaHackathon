import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { Prioridades } from '../preferencias/preferencias.model';

@ObjectType('RiesgoZona', {
  description:
    'Un riesgo de la zona de la parcela, calculado con un modelo de ml/ en el punto de la parcela. Los niveles usan umbrales ' +
    'provisionales ([POR VERIFICAR] con el agrónomo): sirven para comparar, no para decidir.',
})
export class RiesgoZonaTipo {
  @Field(() => String, { description: 'calor | sequia | humedad | estres | vulnerabilidad | erosion | pendiente | elevacion | lluvia' })
  clave: string;

  @Field(() => String, { nullable: true, description: 'BAJO | MEDIO | ALTO. null = sin dato o solo informativo (lluvia).' })
  nivel?: string | null;

  @Field(() => Float, { nullable: true })
  valor?: number | null;

  @Field(() => String)
  unidad: string;

  @Field(() => String, { description: 'Modelo de ml/ del que sale, p. ej. c05b' })
  modelo: string;

  @Field(() => String, { nullable: true })
  datosAl?: string | null;

  @Field(() => Int, { nullable: true, description: 'Tamaño de celda del dato, en metros.' })
  resolucionM?: number | null;

  @Field(() => Boolean, { nullable: true, description: 'true = el detalle dentro de la parcela es interpolación.' })
  interpolada?: boolean | null;

  @Field(() => Int, { nullable: true, description: 'Solo estres: puntos evaluados dentro del radio.' })
  puntosCercanos?: number | null;

  @Field(() => Int, { nullable: true, description: 'Solo estres: cuántos de ellos son críticos.' })
  puntosCriticos?: number | null;

  @Field(() => Int, { nullable: true, description: 'Solo estres: radio de búsqueda en km.' })
  radioKm?: number | null;
}

@ObjectType('RiesgosParcela')
export class RiesgosParcelaTipo {
  @Field(() => [RiesgoZonaTipo])
  riesgos: RiesgoZonaTipo[];

  @Field(() => [String], { description: 'Límites que hay que mostrar junto a los riesgos.' })
  advertencias: string[];
}

@ObjectType('AporteCultivo', { description: 'Cuánto aporta un criterio al puntaje de un cultivo.' })
export class AporteCultivoTipo {
  @Field(() => String, { description: 'ingreso | suelo | agua | erosion | local' })
  factor: string;

  @Field(() => Int, { description: '0–100: qué tan bien le va al cultivo en este criterio.' })
  puntaje: number;

  @Field(() => Float, { description: 'Peso efectivo del criterio (ya con prioridades y riesgos de la zona).' })
  peso: number;

  @Field(() => Boolean, { description: 'true = no hay dato de este criterio para el cultivo: cuenta como neutro (50), no se inventa.' })
  sinDato: boolean;
}

@ObjectType('SugerenciaCultivo', {
  description: 'Un cultivo evaluado con los modelos de ml/, los riesgos de la zona y las prioridades del agricultor.',
})
export class SugerenciaCultivoTipo {
  @Field(() => String, { description: 'Código del catálogo (query cultivos); se puede guardar como cultivoActual.' })
  cultivo: string;

  @Field(() => String)
  nombre: string;

  @Field(() => Int, { description: '0–100. Orden relativo entre las opciones, no una probabilidad de éxito.' })
  puntaje: number;

  @Field(() => [AporteCultivoTipo], { description: 'El puntaje desglosado por criterio.' })
  aportes: AporteCultivoTipo[];

  @Field(() => Float, { nullable: true, description: '% de los píxeles de cultivo de Weld que tenían el cultivo base el año anterior y sembraron este (c02, CDL).' })
  probabilidadSiguientePct?: number | null;

  @Field(() => Float, { nullable: true, description: 'Cambio % del precio entre el último dato y el último mes pronosticado (c10, exploratorio).' })
  cambioPrecioPct?: number | null;

  @Field(() => String, { nullable: true })
  unidadPrecio?: string | null;

  @Field(() => Float, { nullable: true, description: 'Rendimiento estimado del condado en t/ha (c01). Solo maíz y trigo de invierno.' })
  rendimientoTHa?: number | null;

  @Field(() => Float, { nullable: true, description: 'Rendimiento histórico del condado en t/ha, para comparar con el estimado.' })
  rendimientoHistoricoTHa?: number | null;

  @Field(() => Int, { nullable: true, description: 'Días de siembra a cosecha, mediana de 10 años (c07). Pocos cultivos tienen dato.' })
  cicloDias?: number | null;

  @Field(() => Boolean, { nullable: true, description: 'true = otra familia botánica que el cultivo base. null si no se conoce.' })
  otraFamilia?: boolean | null;

  @Field(() => Boolean, { description: 'Fija nitrógeno (leguminosa). Clasificación general [POR VERIFICAR].' })
  fijaNitrogeno: boolean;

  @Field(() => String, { description: 'baja | media | alta. Clasificación general [POR VERIFICAR].' })
  demandaAgua: string;

  @Field(() => String, { description: 'baja | media | alta (cobertura del suelo contra la erosión). Clasificación general [POR VERIFICAR].' })
  coberturaSuelo: string;

  @Field(() => Boolean, { description: 'El agricultor lo marcó como preferido.' })
  preferido: boolean;
}

@ObjectType('PesosEvaluacion', { description: 'Peso efectivo de cada criterio tras aplicar prioridades y riesgos de la zona.' })
export class PesosEvaluacionTipo {
  @Field(() => Float) agua: number;
  @Field(() => Float) suelo: number;
  @Field(() => Float) erosion: number;
  @Field(() => Float) ingreso: number;
  @Field(() => Float, { description: 'Práctica local observada (c02); peso fijo y bajo.' }) local: number;
}

@ObjectType('SugerenciasCultivo')
export class SugerenciasCultivoTipo {
  @Field(() => String, { nullable: true, description: 'Cultivo desde el que se calcula (el actual o el último del historial).' })
  cultivoBase?: string | null;

  @Field(() => String, { nullable: true, description: '"actual" o "historial". null si no hay.' })
  origenBase?: string | null;

  @Field(() => SugerenciaCultivoTipo, { nullable: true, description: 'El cultivo base evaluado con los mismos criterios, para comparar.' })
  actual?: SugerenciaCultivoTipo | null;

  @Field(() => [SugerenciaCultivoTipo])
  sugerencias: SugerenciaCultivoTipo[];

  @Field(() => Prioridades, { description: 'Las prioridades con las que se calculó (las guardadas o las que se probaron).' })
  prioridades: Prioridades;

  @Field(() => PesosEvaluacionTipo)
  pesos: PesosEvaluacionTipo;

  @Field(() => [String], { description: 'Códigos de los ajustes por riesgos: agua_riesgo | agua_riego | erosion_vulnerabilidad.' })
  ajustes: string[];

  @Field(() => [RiesgoZonaTipo])
  riesgos: RiesgoZonaTipo[];

  @Field(() => String)
  metodo: string;

  @Field(() => Boolean, { description: 'false = las clasificaciones de agua, nitrógeno y cobertura son generales y aún no están verificadas.' })
  rasgosVerificados: boolean;

  @Field(() => [String])
  advertencias: string[];
}
