import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiKeysRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUser(userId: string) {
    return this.prisma.apiKey.findUnique({ where: { userId } });
  }

  upsert(userId: string, data: { encryptedKey: string; encryptedSecret: string }) {
    return this.prisma.apiKey.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
    });
  }

  delete(userId: string) {
    return this.prisma.apiKey.delete({ where: { userId } });
  }
}
