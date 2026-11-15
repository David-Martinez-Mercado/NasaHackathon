import { Query, Resolver } from '@nestjs/graphql';
import { EstadoServicio } from './salud.model';
import { SaludService } from './salud.service';

@Resolver(() => EstadoServicio)
export class SaludResolver {
  constructor(private readonly salud: SaludService) {}

  @Query(() => EstadoServicio, {
    name: 'salud',
    description: 'Status of the server and of each part it depends on.',
  })
  estado() {
    return this.salud.estado();
  }
}
