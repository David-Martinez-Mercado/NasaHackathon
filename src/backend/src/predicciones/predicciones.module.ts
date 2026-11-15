import { Module } from '@nestjs/common';
import { ImportacionService } from './importacion.service';
import { PrediccionesResolver } from './predicciones.resolver';
import { PrediccionesService } from './predicciones.service';
import { RiesgosService } from './riesgos.service';
import { SugerenciasResolver } from './sugerencias.resolver';
import { SugerenciasService } from './sugerencias.service';

@Module({
  providers: [PrediccionesService, ImportacionService, PrediccionesResolver, RiesgosService, SugerenciasService, SugerenciasResolver],
  exports: [PrediccionesService, ImportacionService],
})
export class PrediccionesModule {}
