import { Query, Resolver } from '@nestjs/graphql';
import { Cultivo } from './cultivo.model';
import { CultivosService } from './cultivos.service';

@Resolver(() => Cultivo)
export class CultivosResolver {
  constructor(private readonly cultivos: CultivosService) {}

  @Query(() => [Cultivo], { name: 'cultivos', description: 'Catalog of available crops.' })
  listar() {
    return this.cultivos.listar();
  }
}
