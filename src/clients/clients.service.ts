import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client, ClientSource } from '../entities/client.entity';
import { normalizePhone } from '../common/phone.util';

export interface CreateClientInput {
  full_name: string;
  phone: string;
  source?: ClientSource;
  discount_default_pct?: number | null;
  notes?: string | null;
  created_at?: Date;
  imported_deals_count?: number;
  imported_deals_sum?: number;
}

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly repo: Repository<Client>,
  ) {}

  /** Single source of truth for client creation — reused by HTTP, CSV import, future bot. */
  async create(input: CreateClientInput): Promise<Client> {
    const client = this.repo.create({
      full_name: input.full_name.trim(),
      phone: normalizePhone(input.phone),
      source: input.source ?? 'manual',
      discount_default_pct: input.discount_default_pct ?? null,
      notes: input.notes ?? null,
      imported_deals_count: input.imported_deals_count ?? 0,
      imported_deals_sum: input.imported_deals_sum ?? 0,
    });
    if (input.created_at) client.created_at = input.created_at;
    return this.repo.save(client);
  }

  findByPhone(rawPhone: string): Promise<Client | null> {
    const phone = normalizePhone(rawPhone);
    if (!phone) return Promise.resolve(null);
    return this.repo.findOne({ where: { phone } });
  }

  findAll(): Promise<Client[]> {
    return this.repo.find({ order: { created_at: 'DESC' } });
  }

  async findOne(id: string): Promise<Client> {
    const client = await this.repo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Клиент не найден');
    return client;
  }

  async update(id: string, data: Partial<CreateClientInput>): Promise<Client> {
    const client = await this.findOne(id);
    if (data.full_name !== undefined) client.full_name = data.full_name.trim();
    if (data.phone !== undefined) client.phone = normalizePhone(data.phone);
    if (data.discount_default_pct !== undefined)
      client.discount_default_pct = data.discount_default_pct;
    if (data.notes !== undefined) client.notes = data.notes;
    return this.repo.save(client);
  }

  async remove(id: string): Promise<void> {
    const res = await this.repo.delete(id);
    if (!res.affected) throw new NotFoundException('Клиент не найден');
  }

  count(): Promise<number> {
    return this.repo.count();
  }
}
