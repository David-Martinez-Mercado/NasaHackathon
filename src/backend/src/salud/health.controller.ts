import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { NivelEstado } from './salud.model';
import { SaludService } from './salud.service';

/** Única excepción REST: la usan el balanceador y el servicio de despliegue. */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly salud: SaludService) {}

  @Get()
  async health() {
    const fuentes = await this.salud.baseDeDatos();
    const caida = fuentes.some((f) => f.estado === NivelEstado.NO_DISPONIBLE);
    const cuerpo = { estado: caida ? 'degradado' : 'ok', baseDeDatos: !caida };
    if (caida) throw new HttpException(cuerpo, HttpStatus.SERVICE_UNAVAILABLE);
    return cuerpo;
  }
}
