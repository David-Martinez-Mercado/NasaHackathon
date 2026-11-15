import { Module } from '@nestjs/common';
import { PreferenciasModule } from '../preferencias/preferencias.module';
import { ParcelasResolver } from './parcelas.resolver';
import { ParcelasService } from './parcelas.service';

@Module({
  imports: [PreferenciasModule],
  providers: [ParcelasService, ParcelasResolver],
  exports: [ParcelasService],
})
export class ParcelasModule {}
