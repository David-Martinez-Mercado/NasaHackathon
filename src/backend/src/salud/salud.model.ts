import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum NivelEstado {
  OK = 'OK',
  DEGRADADO = 'DEGRADADO',
  NO_DISPONIBLE = 'NO_DISPONIBLE',
}
registerEnumType(NivelEstado, { name: 'NivelEstado' });

@ObjectType()
export class EstadoFuente {
  @Field(() => String, { description: 'p. ej. "base de datos", "motor de reglas"' })
  nombre: string;

  @Field(() => NivelEstado)
  estado: NivelEstado;

  @Field(() => String, { nullable: true })
  detalle?: string;
}

@ObjectType()
export class EstadoServicio {
  @Field(() => NivelEstado)
  estado: NivelEstado;

  @Field(() => String)
  version: string;

  @Field(() => String)
  entorno: string;

  @Field(() => Boolean, { description: 'true = usa fixtures en vez de APIs externas' })
  demoOffline: boolean;

  @Field(() => [EstadoFuente])
  fuentes: EstadoFuente[];
}
