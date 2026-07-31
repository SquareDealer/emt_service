import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from './client.entity';
import { WorkOrder } from './work-order.entity';
import { VehicleGeneration } from './vehicle-generation.entity';

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  client_id: string;

  @ManyToOne(() => Client, (c) => c.vehicles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ type: 'text', nullable: true })
  vin: string | null;

  /** «MINI», «BMW», … Free text — the catalog is a helper, not a constraint. */
  @Column({ type: 'text', nullable: true })
  make: string | null;

  @Column({ type: 'text', nullable: true })
  model: string | null;

  /**
   * Generation code snapshot («R56»). Denormalized from the catalog on purpose:
   * it still renders on historic documents if the catalog row is retired, while
   * `generation_id` is what the price list joins on.
   */
  @Column({ name: 'generation_code', type: 'text', nullable: true })
  generation_code: string | null;

  @Column({ name: 'generation_id', type: 'uuid', nullable: true })
  generation_id: string | null;

  @ManyToOne(() => VehicleGeneration, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'generation_id' })
  generation: VehicleGeneration | null;

  @Column({ type: 'text', nullable: true })
  plate: string | null;

  @Column({ type: 'int', nullable: true })
  year: number | null;

  @Column({ type: 'int', nullable: true })
  mileage: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => WorkOrder, (w) => w.vehicle)
  work_orders: WorkOrder[];
}
