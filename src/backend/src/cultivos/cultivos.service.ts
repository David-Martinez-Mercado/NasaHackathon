import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CultivosService {
  constructor(private readonly prisma: PrismaService) {}

  listar() {
    return this.prisma.cultivo.findMany({ orderBy: { nombre: 'asc' } });
  }
}
