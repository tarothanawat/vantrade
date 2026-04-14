import { Injectable } from '@nestjs/common';
import { Role } from '@vantrade/types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: { email: string; passwordHash: string; role: Role }) {
    return this.prisma.user.create({ data });
  }

  findAll() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, role: true },
      orderBy: { email: 'asc' },
    });
  }

  updateRole(id: string, role: Role) {
    return this.prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, email: true, role: true },
    });
  }
}
