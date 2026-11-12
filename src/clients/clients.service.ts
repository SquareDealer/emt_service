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

/** Closed work orders in this CRM — live history, next to the imported one. */
export interface ClosedStats {
  closed_orders_count: number;
  closed_orders_sum: number;
}
export type ClientWithDeals = Client & ClosedStats;

const NO_STATS: ClosedStats = { closed_orders_count: 0, closed_orders_sum: 0 };

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

  async findAll(): Promise<ClientWithDeals[]> {
    const [clients, stats] = await Promise.all([
      this.repo.find({ order: { created_at: 'DESC' } }),
      this.closedStats(),
    ]);
    return clients.map((c) => Object.assign(c, stats.get(c.id) ?? NO_STATS));
  }

  async findOne(id: string): Promise<ClientWithDeals> {
    const client = await this.load(id);
    const stats = await this.closedStats(id);
    return Object.assign(client, stats.get(id) ?? NO_STATS);
  }

  /** The bare entity — what gets saved. Computed stats must never reach save(). */
  private async load(id: string): Promise<Client> {
    const client = await this.repo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Клиент не найден');
    return client;
  }

  /**
   * Closed orders per client, in one grouped query. Not role-scoped on purpose:
   * this is an aggregate about the client, it exposes no order. node-postgres
   * hands COUNT/SUM back as strings, hence the Number().
   */
  private async closedStats(clientId?: string): Promise<Map<string, ClosedStats>> {
    const qb = this.repo.manager
      .createQueryBuilder(WorkOrder, 'wo')
      .innerJoin(Vehicle, 'v', 'v.id = wo.vehicle_id')
      .select('v.client_id', 'client_id')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(COALESCE(wo.total_frozen, wo.total_cached)), 0)', 'sum')
      .where("wo.status = 'closed'");
    if (clientId) qb.andWhere('v.client_id = :clientId', { clientId });
    const rows = await qb
      .groupBy('v.client_id')
      .getRawMany<{ client_id: string; count: string; sum: string }>();
    return new Map(
      rows.map((r) => [
        r.client_id,
        { closed_orders_count: Number(r.count), closed_orders_sum: Number(r.sum) },
      ]),
    );
  }

  async update(id: string, data: Partial<CreateClientInput>): Promise<Client> {
    const client = await this.load(id);
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
