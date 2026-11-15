import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Cultivo {
  @Field(() => ID)
  id: string;

  @Field(() => String, { description: 'Stable code for filters and preferences, e.g. "maiz"' })
  codigo: string;

  @Field(() => String)
  nombre: string;

  @Field(() => String)
  familiaBotanica: string;

  @Field(() => Boolean, { description: 'false = the agronomic parameters do not have a verified source yet' })
  verificado: boolean;
}
