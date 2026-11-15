import { Global, Module } from '@nestjs/common';
import { TransaccionService } from '../common/transaccion.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({ providers: [PrismaService, TransaccionService], exports: [PrismaService, TransaccionService] })
export class PrismaModule {}
