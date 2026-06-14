import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from '../entities/vehicle.entity';
import { Client } from '../entities/client.entity';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle)
    private readonly repo: Repository<Vehicle>,
    @InjectRepository(Client)
    private readonly clients: Repository<Client>,
  ) {}

  async create(dto: CreateVehicleDto): Promise<Vehicle> {
    const client = await this.clients.findOne({ where: { id: dto.client_id } });
    if (!client) throw new BadRequestException('Клиент не найден');
    const vehicle = this.repo.create({
      client_id: dto.client_id,
      vin: dto.vin?.trim() || null,
      model: dto.model?.trim() || null,
      plate: dto.plate?.trim() || null,
      year: dto.year ?? null,
      mileage: dto.mileage ?? null,
      notes: dto.notes ?? null,
    });
    return this.repo.save(vehicle);
  }

  findByClient(clientId: string): Promise<Vehicle[]> {
    return this.repo.find({
      where: { client_id: clientId },
      order: { created_at: 'ASC' },
    });
  }

  findAll(): Promise<Vehicle[]> {
    return this.repo.find({ order: { created_at: 'DESC' } });
  }

  async findOne(id: string): Promise<Vehicle> {
    const v = await this.repo.findOne({ where: { id }, relations: { client: true } });
    if (!v) throw new NotFoundException('ТС не найдено');
    return v;
  }

  async update(id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const v = await this.findOne(id);
    if (dto.vin !== undefined) v.vin = dto.vin.trim() || null;
    if (dto.model !== undefined) v.model = dto.model.trim() || null;
    if (dto.plate !== undefined) v.plate = dto.plate.trim() || null;
    if (dto.year !== undefined) v.year = dto.year;
    if (dto.mileage !== undefined) v.mileage = dto.mileage;
    if (dto.notes !== undefined) v.notes = dto.notes;
    return this.repo.save(v);
  }

  async remove(id: string): Promise<void> {
    const res = await this.repo.delete(id);
    if (!res.affected) throw new NotFoundException('ТС не найдено');
  }
}
