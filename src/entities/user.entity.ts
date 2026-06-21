import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type UserRole = 'owner' | 'master_receptionist' | 'master';

export const USER_ROLES: UserRole[] = ['owner', 'master_receptionist', 'master'];

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', unique: true })
  login: string;

  @Column({ name: 'password_hash', type: 'text' })
  password_hash: string;

  @Column({
    type: 'enum',
    enum: ['owner', 'master_receptionist', 'master'],
    enumName: 'user_role',
    default: 'owner',
  })
  role: UserRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  is_active: boolean;
}
