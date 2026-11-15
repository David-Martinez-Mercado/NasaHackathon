import { Module } from '@nestjs/common';
import { DatosModule } from '../datos/datos.port';
import { MotorModule } from '../motor/motor.port';
import { ParcelasModule } from '../parcelas/parcelas.module';
import { PreferenciasModule } from '../preferencias/preferencias.module';
import { RecomendacionesResolver } from './recomendaciones.resolver';
import { RecomendacionesService } from './recomendaciones.service';

@Module({
  imports: [ParcelasModule, PreferenciasModule, DatosModule, MotorModule],
  providers: [RecomendacionesService, RecomendacionesResolver],
  exports: [RecomendacionesService],
})
export class RecomendacionesModule {}
