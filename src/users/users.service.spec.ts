import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { User } from '../entities/user.entity';

function user(p: Partial<User>): User {
  return {
    id: '',
    name: 'X',
    login: 'x',
    password_hash: 'hash',
    role: 'master',
    is_active: true,
    ...p,
  } as User;
}

function makeRepo(seed: User[]) {
  const rows = [...seed];
  let counter = 0;
  return {
    rows,
    findOne: async ({ where }: { where: { id?: string; login?: string } }) => {
      if (where.id) return rows.find((r) => r.id === where.id) ?? null;
      if (where.login) return rows.find((r) => r.login === where.login) ?? null;
      return null;
    },
    create: (data: Partial<User>) => ({ id: `gen-${++counter}`, ...data }) as User,
    save: async (u: User) => {
      const i = rows.findIndex((r) => r.id === u.id);
      if (i >= 0) rows[i] = u;
      else rows.push(u);
      return u;
    },
    count: async ({ where }: { where: Partial<User> }) =>
      rows.filter(
        (r) =>
          (where.role === undefined || r.role === where.role) &&
          (where.is_active === undefined || r.is_active === where.is_active),
      ).length,
    find: async () => rows,
  };
}

function svc(seed: User[]) {
  const repo = makeRepo(seed);
  return { repo, service: new UsersService(repo as never) };
}

describe('UsersService.createUser', () => {
  it('hashes the password, stores the role, and never returns the hash', async () => {
    const { repo, service } = svc([]);
    const created = await service.createUser({
      name: 'Master One',
      login: 'm1',
      password: 'secret1',
      role: 'master',
    });
    expect(created).not.toHaveProperty('password_hash');
    expect(created.role).toBe('master');
    const stored = repo.rows[0];
    expect(stored.password_hash).not.toBe('secret1');
    expect(await bcrypt.compare('secret1', stored.password_hash)).toBe(true);
  });

  it('rejects a duplicate login', async () => {
    const { service } = svc([user({ id: 'o', login: 'owner', role: 'owner' })]);
    await expect(
      service.createUser({ name: 'X', login: 'owner', password: '1234', role: 'master' }),
    ).rejects.toThrow(/Логин уже занят/);
  });
});

describe('UsersService.updateUser — last-owner protection', () => {
  it('refuses to demote the only active owner', async () => {
    const { service } = svc([user({ id: 'o', login: 'owner', role: 'owner' })]);
    await expect(service.updateUser('o', { role: 'master' }, 'admin')).rejects.toThrow(
      /последнего активного владельца/,
    );
  });

  it('refuses to deactivate the only active owner', async () => {
    const { service } = svc([user({ id: 'o', login: 'owner', role: 'owner' })]);
    await expect(service.updateUser('o', { is_active: false }, 'admin')).rejects.toThrow(
      /последнего активного владельца/,
    );
  });

  it('allows deactivating one owner when another active owner remains', async () => {
    const { service } = svc([
      user({ id: 'o1', login: 'o1', role: 'owner' }),
      user({ id: 'o2', login: 'o2', role: 'owner' }),
    ]);
    const r = await service.updateUser('o2', { is_active: false }, 'o1');
    expect(r.is_active).toBe(false);
  });
});

describe('UsersService.updateUser — misc', () => {
  it('blocks self-deactivation', async () => {
    const { service } = svc([
      user({ id: 'o1', login: 'o1', role: 'owner' }),
      user({ id: 'o2', login: 'o2', role: 'owner' }),
    ]);
    await expect(service.updateUser('o1', { is_active: false }, 'o1')).rejects.toThrow(
      /самого себя/,
    );
  });

  it('hashes a reset password', async () => {
    const { repo, service } = svc([user({ id: 'm', login: 'm', role: 'master' })]);
    await service.updateUser('m', { password: 'brandnew' }, 'admin');
    expect(await bcrypt.compare('brandnew', repo.rows[0].password_hash)).toBe(true);
  });

  it('throws NotFound for an unknown user', async () => {
    const { service } = svc([]);
    await expect(service.updateUser('nope', { name: 'Y' }, 'admin')).rejects.toThrow(
      /не найден/,
    );
  });
});

describe('UsersService.isAssignable', () => {
  it('is true only for an existing active user', async () => {
    const { service } = svc([
      user({ id: 'a', is_active: true }),
      user({ id: 'b', is_active: false }),
    ]);
    expect(await service.isAssignable('a')).toBe(true);
    expect(await service.isAssignable('b')).toBe(false);
    expect(await service.isAssignable('missing')).toBe(false);
  });
});
