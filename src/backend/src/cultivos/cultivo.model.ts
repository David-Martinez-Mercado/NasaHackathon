import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Cultivo {
  @Field(() => ID)
  id: string;

  @Field(() => String, { description: 'Código estable para filtros y preferencias, p. ej. "maiz"' })
  codigo: string;

  @Field(() => String)
  nombre: string;

  @Field(() => String)
  familiaBotanica: string;

  @Field(() => Boolean, { description: 'false = los parámetros agronómicos aún no tienen fuente verificada' })
  verificado: boolean;
}
