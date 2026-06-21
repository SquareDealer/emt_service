import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '../entities/user.entity';

/** A user without the password hash — safe to send to clients. */
export type SafeUser = Omit<User, 'password_hash'>;

const SAFE_SELECT = {
  id: true,
  name: true,
  login: true,
  role: true,
  is_active: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  findByLogin(login: string): Promise<User | null> {
    return this.repo.findOne({ where: { login } });
  }

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  count(): Promise<number> {
    return this.repo.count();
  }

  async create(data: Partial<User>): Promise<User> {
    const user = this.repo.create(data);
    return this.repo.save(user);
  }

  /** All users, without password hashes (for management + the master picker). */
  findAllSafe(): Promise<SafeUser[]> {
    return this.repo.find({
      select: SAFE_SELECT,
      order: { is_active: 'DESC', name: 'ASC' },
    }) as Promise<SafeUser[]>;
  }

  async createUser(data: {
    name: string;
    login: string;
    password: string;
    role: UserRole;
  }): Promise<SafeUser> {
    if (await this.findByLogin(data.login)) {
      throw new ConflictException('Логин уже занят');
    }
    const password_hash = await bcrypt.hash(data.password, 10);
    const saved = await this.create({
      name: data.name,
      login: data.login,
      password_hash,
      role: data.role,
      is_active: true,
    });
    return this.toSafe(saved);
  }

  async updateUser(
    id: string,
    patch: { name?: string; role?: UserRole; password?: string; is_active?: boolean },
    actingUserId: string,
  ): Promise<SafeUser> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Пользователь не найден');

    if (patch.is_active === false && id === actingUserId) {
      throw new BadRequestException('Нельзя деактивировать самого себя');
    }

    // Protect the last active owner from being demoted or deactivated.
    const losingOwner =
      user.role === 'owner' &&
      ((patch.role !== undefined && patch.role !== 'owner') ||
        patch.is_active === false);
    if (losingOwner) {
      const activeOwners = await this.repo.count({
        where: { role: 'owner', is_active: true },
      });
      if (activeOwners <= 1) {
        throw new BadRequestException('Нельзя убрать последнего активного владельца');
      }
    }

    if (patch.name !== undefined) user.name = patch.name;
    if (patch.role !== undefined) user.role = patch.role;
    if (patch.is_active !== undefined) user.is_active = patch.is_active;
    if (patch.password) user.password_hash = await bcrypt.hash(patch.password, 10);

    const saved = await this.repo.save(user);
    return this.toSafe(saved);
  }

  /** Soft-delete: deactivate (keeps work-order history / FK intact). */
  deactivate(id: string, actingUserId: string): Promise<SafeUser> {
    return this.updateUser(id, { is_active: false }, actingUserId);
  }

  /** Hard delete: unassign the user from any orders, then remove the row. */
  async deleteUser(id: string, actingUserId: string): Promise<{ id: string }> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Пользователь не найден');
    if (id === actingUserId) {
      throw new BadRequestException('Нельзя удалить самого себя');
    }
    if (user.role === 'owner') {
      const owners = await this.repo.count({ where: { role: 'owner' } });
      if (owners <= 1) {
        throw new BadRequestException('Нельзя удалить последнего владельца');
      }
    }
    // The FK work_orders.assigned_master_id has no ON DELETE — clear it first.
    await this.repo.manager.query(
      'UPDATE work_orders SET assigned_master_id = NULL WHERE assigned_master_id = $1',
      [id],
    );
    await this.repo.delete(id);
    return { id };
  }

  /** True if the user exists, is active, and may be assigned to a work order. */
  async isAssignable(id: string): Promise<boolean> {
    const u = await this.findById(id);
    return !!u && u.is_active;
  }

  private toSafe(u: User): SafeUser {
    const safe = { ...u };
    delete (safe as Partial<User>).password_hash;
    return safe;
  }
}
