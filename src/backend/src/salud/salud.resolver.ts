import { Query, Resolver } from '@nestjs/graphql';
import { EstadoServicio } from './salud.model';
import { SaludService } from './salud.service';

@Resolver(() => EstadoServicio)
export class SaludResolver {
  constructor(private readonly salud: SaludService) {}

  @Query(() => EstadoServicio, {
    name: 'salud',
    description: 'Estado del servidor y de cada pieza de la que depende.',
  })
  estado() {
    return this.salud.estado();
  }
}
