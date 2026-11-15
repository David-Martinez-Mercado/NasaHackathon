import { Module } from '@nestjs/common';
import { CultivosResolver } from './cultivos.resolver';
import { CultivosService } from './cultivos.service';

@Module({ providers: [CultivosService, CultivosResolver], exports: [CultivosService] })
export class CultivosModule {}
