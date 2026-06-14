import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskTemplate } from '../entities/task-template.entity';

@Injectable()
export class TaskTemplatesService {
  constructor(
    @InjectRepository(TaskTemplate)
    private readonly repo: Repository<TaskTemplate>,
  ) {}

  findAll(includeInactive = false): Promise<TaskTemplate[]> {
    return this.repo.find({
      where: includeInactive ? {} : { active: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<TaskTemplate> {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Шаблон не найден');
    return t;
  }

  create(data: Partial<TaskTemplate>): Promise<TaskTemplate> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: string, data: Partial<TaskTemplate>): Promise<TaskTemplate> {
    const t = await this.findOne(id);
    Object.assign(t, data);
    return this.repo.save(t);
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  count(): Promise<number> {
    return this.repo.count();
  }
}
