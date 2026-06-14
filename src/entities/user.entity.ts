import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type UserRole = 'owner';

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

  @Column({ type: 'enum', enum: ['owner'], enumName: 'user_role', default: 'owner' })
  role: UserRole;
}
