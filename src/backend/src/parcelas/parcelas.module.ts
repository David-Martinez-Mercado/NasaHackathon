import { Module } from '@nestjs/common';
import { CultivosModule } from '../cultivos/cultivos.module';
import { HistorialModule } from '../historial/historial.module';
import { PreferenciasModule } from '../preferencias/preferencias.module';
import { ParcelasResolver } from './parcelas.resolver';
import { ParcelasService } from './parcelas.service';

@Module({
  imports: [CultivosModule, PreferenciasModule, HistorialModule],
  providers: [ParcelasService, ParcelasResolver],
  exports: [ParcelasService],
})
export class ParcelasModule {}
