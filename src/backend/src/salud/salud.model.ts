import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum NivelEstado {
  OK = 'OK',
  DEGRADADO = 'DEGRADADO',
  NO_DISPONIBLE = 'NO_DISPONIBLE',
}
registerEnumType(NivelEstado, { name: 'NivelEstado' });

@ObjectType()
export class EstadoFuente {
  @Field(() => String, { description: 'e.g. "base de datos", "motor de reglas" (database, rules engine)' })
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

  @Field(() => Boolean, { description: 'true = uses fixtures instead of external APIs' })
  demoOffline: boolean;

  @Field(() => [EstadoFuente])
  fuentes: EstadoFuente[];
}
