import { Module } from '@nestjs/common';
import { ImportacionService } from './importacion.service';
import { PrediccionesResolver } from './predicciones.resolver';
import { PrediccionesService } from './predicciones.service';

@Module({
  providers: [PrediccionesService, ImportacionService, PrediccionesResolver],
  exports: [PrediccionesService, ImportacionService],
})
export class PrediccionesModule {}
