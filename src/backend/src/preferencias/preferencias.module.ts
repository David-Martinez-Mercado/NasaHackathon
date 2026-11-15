import { Module } from '@nestjs/common';
import { CultivosModule } from '../cultivos/cultivos.module';
import { PreferenciasResolver } from './preferencias.resolver';
import { PreferenciasService } from './preferencias.service';

@Module({
  imports: [CultivosModule],
  providers: [PreferenciasService, PreferenciasResolver],
  exports: [PreferenciasService],
})
export class PreferenciasModule {}
