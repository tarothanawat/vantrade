import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type {
    BlueprintCreateDto,
    BlueprintUpdateDto,
    BlueprintVerifyDto,
} from '@vantrade/types';
import { BlueprintsRepository } from './blueprints.repository';

@Injectable()
export class BlueprintsService {
  constructor(private readonly repo: BlueprintsRepository) {}

  findAllVerified() {
    return this.repo.findAllVerified();
  }

  findAll() {
    return this.repo.findAll();
  }

  async findById(id: string) {
    const blueprint = await this.repo.findById(id);
    if (!blueprint) throw new NotFoundException('Blueprint not found');
    return blueprint;
  }

  findByAuthor(authorId: string) {
    return this.repo.findByAuthor(authorId);
  }

  async create(dto: BlueprintCreateDto, authorId: string) {
    const existing = await this.repo.findByTitleAndAuthor(dto.title, authorId);
    if (existing) throw new ConflictException('You already have a blueprint with this title');

    return this.repo.create({ ...dto, authorId });
  }

  async update(id: string, dto: BlueprintUpdateDto, requesterId: string) {
    const blueprint = await this.repo.findById(id);
    if (!blueprint) throw new NotFoundException('Blueprint not found');
    if (blueprint.authorId !== requesterId) throw new ForbiddenException('Not your blueprint');

    return this.repo.update(id, dto);
  }

  async verify(id: string, dto: BlueprintVerifyDto) {
    const blueprint = await this.repo.findById(id);
    if (!blueprint) throw new NotFoundException('Blueprint not found');
    return this.repo.setVerified(id, dto.isVerified);
  }

  async remove(id: string, requesterId: string) {
    const blueprint = await this.repo.findById(id);
    if (!blueprint) throw new NotFoundException('Blueprint not found');
    if (blueprint.authorId !== requesterId) throw new ForbiddenException('Not your blueprint');

    return this.repo.delete(id);
  }
}
