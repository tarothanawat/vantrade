import { Injectable } from '@nestjs/common';
import type { BlueprintCreateDto, BlueprintUpdateDto } from '@vantrade/types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BlueprintsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllVerified() {
    return this.prisma.blueprint.findMany({
      where: { isVerified: true },
      include: { author: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAll() {
    return this.prisma.blueprint.findMany({
      include: { author: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.blueprint.findUnique({
      where: { id },
      include: { author: { select: { id: true, email: true } } },
    });
  }

  findByTitleAndAuthor(title: string, authorId: string) {
    return this.prisma.blueprint.findFirst({ where: { title, authorId } });
  }

  findByAuthor(authorId: string) {
    return this.prisma.blueprint.findMany({
      where: { authorId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: BlueprintCreateDto & { authorId: string }) {
    return this.prisma.blueprint.create({ data });
  }

  update(id: string, data: BlueprintUpdateDto) {
    return this.prisma.blueprint.update({ where: { id }, data });
  }

  setVerified(id: string, isVerified: boolean) {
    return this.prisma.blueprint.update({ where: { id }, data: { isVerified } });
  }

  delete(id: string) {
    return this.prisma.blueprint.delete({ where: { id } });
  }
}
