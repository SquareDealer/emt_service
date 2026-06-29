import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../common/numeric.transformer';
import { WorkOrder } from './work-order.entity';

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

  @Column({ type: 'numeric', precision: 12, scale: 3, default: 1, transformer: numericTransformer })
  qty: number;

  @Column({ type: 'text', default: 'pcs' })
  unit: PartUnit;

  @Column({ name: 'unit_price', type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  unit_price: number;
}
