import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Client, ClientSource } from '../entities/client.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { WorkOrder } from '../entities/work-order.entity';
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

  /**
   * Cascade-delete a client: removes the client, its vehicles and all OPEN work
   * orders (with their estimate lines via FK CASCADE). Closed work orders are
   * revenue history (total_frozen/closed_at) — if any exist we refuse and let the
   * user deal with them first. Done in one transaction so a refusal leaves nothing
   * half-deleted. The work_orders→vehicles FK is RESTRICT, so orders must go before
   * the vehicles cascade fires (vehicles cascade with the client delete).
   */
  async remove(id: string): Promise<void> {
    await this.repo.manager.transaction(async (m) => {
      const client = await m.findOne(Client, { where: { id } });
      if (!client) throw new NotFoundException('Клиент не найден');

      const vehicles = await m.find(Vehicle, { where: { client_id: id }, select: ['id'] });
      const vehicleIds = vehicles.map((v) => v.id);

      if (vehicleIds.length) {
        const closed = await m.count(WorkOrder, {
          where: { vehicle_id: In(vehicleIds), status: 'closed' },
        });
        if (closed > 0) {
          throw new ConflictException(
            'Нельзя удалить клиента: есть закрытые наряды (история выручки). Сначала разберитесь с ними.',
          );
        }
        await m.delete(WorkOrder, { vehicle_id: In(vehicleIds) });
      }

      await m.delete(Client, { id });
    });
  }

  count(): Promise<number> {
    return this.repo.count();
  }
}
