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

  @Column({ type: 'text', nullable: true })
  model: string | null;

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
