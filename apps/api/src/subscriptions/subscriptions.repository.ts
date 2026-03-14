import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUser(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId },
      include: {
        blueprint: true,
        tradeLogs: { orderBy: { executedAt: 'desc' }, take: 10 },
      },
    });
  }

  findById(id: string) {
    return this.prisma.subscription.findUnique({
      where: { id },
      include: { blueprint: true, user: { include: { apiKeys: true } } },
    });
  }

  findExisting(userId: string, blueprintId: string) {
    return this.prisma.subscription.findUnique({
      where: { userId_blueprintId: { userId, blueprintId } },
    });
  }

  findAllActive() {
    return this.prisma.subscription.findMany({
      where: { isActive: true },
      include: {
        blueprint: true,
        user: { include: { apiKeys: true } },
      },
    });
  }

  create(userId: string, blueprintId: string) {
    return this.prisma.subscription.create({
      data: { userId, blueprintId },
    });
  }

  setActive(id: string, isActive: boolean) {
    return this.prisma.subscription.update({
      where: { id },
      data: { isActive },
    });
  }

  delete(id: string) {
    return this.prisma.subscription.delete({ where: { id } });
  }
}
