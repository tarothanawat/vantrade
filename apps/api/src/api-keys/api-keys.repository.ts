import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiKeysRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUser(userId: string) {
    return this.prisma.apiKey.findMany({ where: { userId } });
  }

  findByUserAndLabel(userId: string, label: string) {
    return this.prisma.apiKey.findUnique({ where: { userId_label: { userId, label } } });
  }

  upsert(userId: string, data: { encryptedKey: string; encryptedSecret: string; label: string }) {
    return this.prisma.apiKey.upsert({
      where: { userId_label: { userId, label: data.label } },
      create: { userId, ...data },
      update: { encryptedKey: data.encryptedKey, encryptedSecret: data.encryptedSecret },
    });
  }

  delete(userId: string, label: string) {
    return this.prisma.apiKey.delete({ where: { userId_label: { userId, label } } });
  }
}
