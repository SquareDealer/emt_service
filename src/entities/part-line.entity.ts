import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../common/numeric.transformer';
import { WorkOrder, DiscountType } from './work-order.entity';

/** Unit of measure for a part line: pieces or liters (liters allow fractional qty). */
export type PartUnit = 'pcs' | 'l';

@Entity('part_lines')
export class PartLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'work_order_id', type: 'uuid' })
  work_order_id: string;

  @ManyToOne(() => WorkOrder, (w) => w.part_lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_order_id' })
  work_order: WorkOrder;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'catalog_number', type: 'text', nullable: true })
  catalog_number: string | null;

  /** Brand — «отдельное название для производителя запчастей». */
  @Column({ type: 'text', nullable: true })
  manufacturer: string | null;

  /** Catalog entry this line was picked from (provenance, like labor's template_id). */
  @Column({ name: 'part_template_id', type: 'uuid', nullable: true })
  part_template_id: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 3, default: 1, transformer: numericTransformer })
  qty: number;

  @Column({ type: 'text', default: 'pcs' })
  unit: PartUnit;

  @Column({ name: 'unit_price', type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  unit_price: number;


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

  /** Закупка за единицу. Только для владельца — select:false, см. AnalyticsService. */
  @Column({
    name: 'purchase_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    select: false,
    transformer: numericTransformer,
  })
  purchase_price?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;
}
