import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../entities/client.entity';
import { Vehicle } from '../entities/vehicle.entity';

export interface SearchHit {
  id: string;
  type: 'client' | 'vehicle';
  full_name?: string;
  phone?: string;
  source?: string;
  vin?: string | null;
  plate?: string | null;
  make?: string | null;
  model?: string | null;
  generation_code?: string | null;
  client?: { id: string; full_name: string; phone: string } | null;
}

const LIMIT = 50;

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Client)
    private readonly clients: Repository<Client>,
    @InjectRepository(Vehicle)
    private readonly vehicles: Repository<Vehicle>,
  ) {}

  /**
   * Unified search across clients (ФИО, телефон) and vehicles (VIN, госномер).
   * Returns a flat array; clients first so phone/name lookups resolve to a
   * client at index 0. ILIKE '%q%' — pg_trgm GIN indexes keep it fast.
   */
  async search(q?: string): Promise<SearchHit[]> {
    const term = (q ?? '').trim();
    if (!term) return [];
    const like = `%${term}%`;

    const clientRows = await this.clients
      .createQueryBuilder('c')
      .where('c.full_name ILIKE :like', { like })
      .orWhere('c.phone ILIKE :like', { like })
      .orderBy('c.created_at', 'DESC')
      .limit(LIMIT)
      .getMany();

    const vehicleRows = await this.vehicles
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.client', 'client')
      .where('v.vin ILIKE :like', { like })
      .orWhere('v.plate ILIKE :like', { like })
      // Make/model/generation joined the search once cars stopped being all-MINI:
      // «Countryman» or «BMW» previously matched nothing.
      .orWhere('v.make ILIKE :like', { like })
      .orWhere('v.model ILIKE :like', { like })
      .orWhere('v.generation_code ILIKE :like', { like })
      .orderBy('v.created_at', 'DESC')
      .limit(LIMIT)
      .getMany();

    const clientHits: SearchHit[] = clientRows.map((c) => ({
      id: c.id,
      type: 'client',
      full_name: c.full_name,
      phone: c.phone,
      source: c.source,
    }));

    const vehicleHits: SearchHit[] = vehicleRows.map((v) => ({
      id: v.id,
      type: 'vehicle',
      vin: v.vin,
      plate: v.plate,
      make: v.make,
      model: v.model,
      generation_code: v.generation_code,
      client: v.client
        ? { id: v.client.id, full_name: v.client.full_name, phone: v.client.phone }
        : null,
    }));

    return [...clientHits, ...vehicleHits];
  }
}
