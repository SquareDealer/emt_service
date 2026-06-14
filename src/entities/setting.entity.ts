import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Key-value settings. MVP uses a single key `labor_rate`. Kept as a generic
 * table so future global config (tax %, default duration, …) lands without
 * migration. Values are stored as text and parsed by the consuming service.
 */
@Entity('settings')
export class Setting {
  @PrimaryColumn({ type: 'text' })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at: Date;
}
