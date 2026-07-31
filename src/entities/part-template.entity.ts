import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../common/numeric.transformer';
import { PartUnit } from './part-line.entity';

/**
 * Parts catalog — the counterpart of `task_templates` for works.
 *
 * Still «только стоимость, не склад»: no quantities on hand, no suppliers. It
 * exists so a part can be picked instead of retyped, and so the estimate keeps
 * a link back to what was picked.
 */
@Entity('part_templates')
export class PartTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  manufacturer: string | null;

  @Column({ name: 'catalog_number', type: 'text', nullable: true })
  catalog_number: string | null;

  @Column({ type: 'text', default: 'pcs' })
  unit: PartUnit;

  @Column({
    name: 'default_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  default_price: number | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}
