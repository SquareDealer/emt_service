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
import { numericTransformer } from '../common/numeric.transformer';
import { Vehicle } from './vehicle.entity';
import { User } from './user.entity';
import { LaborLine } from './labor-line.entity';
import { PartLine } from './part-line.entity';

export type WorkOrderStatus =
  | 'scheduled'
  | 'in_progress'
  | 'waiting'
  | 'done'
  | 'closed';

export type DiscountType = 'percent' | 'fixed';

@Entity('work_orders')
export class WorkOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicle_id: string;

  @ManyToOne(() => Vehicle, (v) => v.work_orders, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;

  @Column({ name: 'assigned_master_id', type: 'uuid', nullable: true })
  assigned_master_id: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_master_id' })
  assigned_master: User | null;

  @Column({
    type: 'enum',
    enum: ['scheduled', 'in_progress', 'waiting', 'done', 'closed'],
    enumName: 'work_order_status',
    default: 'scheduled',
  })
  status: WorkOrderStatus;

  @Column({ type: 'text', nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduled_at: Date | null;

  @Column({ name: 'scheduled_duration_min', type: 'int', nullable: true })
  scheduled_duration_min: number | null;

  @Column({
    name: 'discount_type',
    type: 'enum',
    enum: ['percent', 'fixed'],
    enumName: 'discount_type',
    nullable: true,
  })
  discount_type: DiscountType | null;

  @Column({
    name: 'discount_value',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  discount_value: number | null;

  @Column({
    name: 'total_cached',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  total_cached: number;

  @Column({
    name: 'total_frozen',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  total_frozen: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closed_at: Date | null;

  /** Sequential calc-document number, assigned on first freeze (see migration). */
  @Column({ name: 'doc_number', type: 'int', nullable: true })
  doc_number: number | null;

  /** Sequential «Заказ-наряд» document number, own sequence, assigned lazily. */
  @Column({ name: 'order_doc_number', type: 'int', nullable: true })
  order_doc_number: number | null;

  /** Running total the client has paid; editable even after close. */
  @Column({
    name: 'paid_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  paid_amount: number;

  @OneToMany(() => LaborLine, (l) => l.work_order, { cascade: true })
  labor_lines: LaborLine[];

  @OneToMany(() => PartLine, (p) => p.work_order, { cascade: true })
  part_lines: PartLine[];
}
