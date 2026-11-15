import { Module } from '@nestjs/common';
import { ParcelasModule } from '../parcelas/parcelas.module';
import { RecomendacionesModule } from '../recomendaciones/recomendaciones.module';
import { EscenariosResolver } from './escenarios.resolver';
import { EscenariosService } from './escenarios.service';

@Module({
  imports: [ParcelasModule, RecomendacionesModule],
  providers: [EscenariosService, EscenariosResolver],
})
export class EscenariosModule {}
