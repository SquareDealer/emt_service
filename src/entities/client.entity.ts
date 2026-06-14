import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../common/numeric.transformer';
import { Vehicle } from './vehicle.entity';

export type ClientSource = 'manual' | 'telegram_bot' | 'csv_import';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'full_name', type: 'text' })
  full_name: string;

  @Column({ type: 'text' })
  phone: string;

  @Column({ type: 'enum', enum: ['manual', 'telegram_bot', 'csv_import'], enumName: 'client_source', default: 'manual' })
  source: ClientSource;

  @Column({
    name: 'discount_default_pct',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  discount_default_pct: number | null;

  @Column({ name: 'imported_deals_count', type: 'int', default: 0 })
  imported_deals_count: number;

  @Column({
    name: 'imported_deals_sum',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  imported_deals_sum: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => Vehicle, (v) => v.client)
  vehicles: Vehicle[];
}
