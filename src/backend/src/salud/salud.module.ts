import { Module } from '@nestjs/common';
import { DatosModule } from '../datos/datos.port';
import { MotorModule } from '../motor/motor.port';
import { HealthController } from './health.controller';
import { SaludResolver } from './salud.resolver';
import { SaludService } from './salud.service';

@Module({
  imports: [MotorModule, DatosModule],
  controllers: [HealthController],
  providers: [SaludService, SaludResolver],
})
export class SaludModule {}
