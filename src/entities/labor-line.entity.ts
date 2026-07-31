import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../common/numeric.transformer';
import { WorkOrder } from './work-order.entity';
import { TaskTemplate } from './task-template.entity';
import { DiscountType } from './work-order.entity';

@Entity('labor_lines')
export class LaborLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'work_order_id', type: 'uuid' })
  work_order_id: string;

  @ManyToOne(() => WorkOrder, (w) => w.labor_lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_order_id' })
  work_order: WorkOrder;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  template_id: string | null;

  @ManyToOne(() => TaskTemplate, { nullable: true })
  @JoinColumn({ name: 'template_id' })
  template: TaskTemplate | null;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: numericTransformer })
  hours: number | null;

  @Column({ name: 'rate_snapshot', type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  rate_snapshot: number;

  @Column({
    name: 'price_override',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  price_override: number | null;


  /** Per-line discount — «скидка на конкретную работу». Applied before the order discount. */
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


  /**
   * Estimate block this line belongs to. Denormalized on purpose — see the
   * migration for why there is no groups table.
   */
  @Column({ name: 'group_key', type: 'uuid', nullable: true })
  group_key: string | null;

  @Column({ name: 'group_name', type: 'text', nullable: true })
  group_name: string | null;

  @Column({ name: 'group_sort', type: 'int', default: 0 })
  group_sort: number;

  /** Position within the estimate. Plain int — no transformer, so the DB default applies. */
  @Column({ type: 'int', default: 0 })
  sort: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;
}
