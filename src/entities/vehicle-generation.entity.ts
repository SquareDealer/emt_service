import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Catalog of vehicle generations — the key the price list is split by.
 *
 * Deliberately NOT a constraint on `vehicles`: the shop specialises in MINI but
 * takes other cars, so a vehicle may carry free-text make/model with no catalog
 * row. Rows are retired via `active`, never deleted, so historic vehicles keep
 * their link.
 */
@Entity('vehicle_generations')
export class VehicleGeneration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** «MINI», «BMW», … */
  @Column({ type: 'text' })
  make: string;

  /** «Hatch», «Countryman», «3 series», … */
  @Column({ type: 'text' })
  model: string;

  /** Generation code — «R56», «F60», «G05». Optional: not every make uses one. */
  @Column({ type: 'text', nullable: true })
  code: string | null;

  /** Display-only production span, e.g. «2006–2013». */
  @Column({ type: 'text', nullable: true })
  years: string | null;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}
