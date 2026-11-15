import { Module } from '@nestjs/common';
import { CultivosModule } from '../cultivos/cultivos.module';
import { HistorialResolver } from './historial.resolver';
import { HistorialService } from './historial.service';

@Module({
  imports: [CultivosModule],
  providers: [HistorialService, HistorialResolver],
  exports: [HistorialService],
})
export class HistorialModule {}
