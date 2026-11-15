import { Module } from '@nestjs/common';
import { PrediccionesModule } from '../predicciones/predicciones.module';
import { MlVivoCliente } from './ml-vivo.cliente';
import { MlVivoResolver } from './ml-vivo.resolver';
import { MlVivoService } from './ml-vivo.service';

@Module({
  imports: [PrediccionesModule],
  providers: [MlVivoCliente, MlVivoService, MlVivoResolver],
  exports: [MlVivoCliente, MlVivoService],
})
export class MlVivoModule {}
