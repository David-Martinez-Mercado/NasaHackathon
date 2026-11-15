import { Module } from '@nestjs/common';
import { PreferenciasResolver } from './preferencias.resolver';
import { PreferenciasService } from './preferencias.service';

@Module({
  providers: [PreferenciasService, PreferenciasResolver],
  exports: [PreferenciasService],
})
export class PreferenciasModule {}
