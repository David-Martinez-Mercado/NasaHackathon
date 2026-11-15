import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('SugerenciaCultivo', {
  description: 'Un cultivo que se podría sembrar en lugar del actual, con los datos que lo respaldan (nada se inventa: lo que falta viene null).',
})
export class SugerenciaCultivoTipo {
  @Field(() => String, { description: 'Código del catálogo (query cultivos); se puede guardar como cultivoActual.' })
  cultivo: string;

  @Field(() => String)
  nombre: string;

  @Field(() => Int, { description: '0–100. Orden relativo entre las opciones, no una probabilidad de éxito.' })
  puntaje: number;

  @Field(() => Float, {
    nullable: true,
    description: '% de los píxeles de cultivo de Weld que tenían el cultivo base el año anterior y sembraron este (modelo c02, CDL).',
  })
  probabilidadSiguientePct?: number | null;

  @Field(() => Float, { nullable: true, description: 'Cambio % del precio entre el último dato y el último mes pronosticado (c10, exploratorio).' })
  cambioPrecioPct?: number | null;

  @Field(() => String, { nullable: true, description: 'Unidad del precio, p. ej. "$ / BU".' })
  unidadPrecio?: string | null;

  @Field(() => Boolean, {
    nullable: true,
    description: 'true = otra familia botánica que el cultivo base (regla general de rotación). null si no se conoce alguna de las dos.',
  })
  otraFamilia?: boolean | null;
}

@ObjectType('SugerenciasCultivo')
export class SugerenciasCultivoTipo {
  @Field(() => String, { nullable: true, description: 'Cultivo desde el que se calcula (el actual o el último del historial).' })
  cultivoBase?: string | null;

  @Field(() => String, { nullable: true, description: '"actual" o "historial": de dónde salió el cultivo base. null si no hay.' })
  origenBase?: string | null;

  @Field(() => [SugerenciaCultivoTipo])
  sugerencias: SugerenciaCultivoTipo[];

  @Field(() => String, { description: 'Cómo se calculó el puntaje, en una frase.' })
  metodo: string;

  @Field(() => [String], { description: 'Límites que hay que mostrar junto a las sugerencias.' })
  advertencias: string[];
}
