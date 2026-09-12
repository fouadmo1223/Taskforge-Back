import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { Permission } from '@flowdesk/types';
import { PermissionsGuard } from './permissions.guard.js';
import { PERMISSION_MODE, REQUIRED_PERMISSIONS } from '../decorators/workspace.decorator.js';
import type { WorkspaceMembershipContext } from '../context/request-context.js';

function ctxWith(membership: Partial<WorkspaceMembershipContext> | undefined): ExecutionContext {
  const req = { membership };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function guardWith(required: Permission[] | undefined, mode?: 'any' | 'all'): PermissionsGuard {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) => {
    if (key === REQUIRED_PERMISSIONS) return required;
    if (key === PERMISSION_MODE) return mode;
    return undefined;
  });
  return new PermissionsGuard(reflector);
}

const member = (perms: Permission[], isOwner = false): WorkspaceMembershipContext => ({
  membershipId: 'm1',
  workspaceId: 'w1',
  userId: 'u1',
  roleId: 'r1',
  roleKey: isOwner ? 'owner' : 'member',
  permissions: new Set(perms),
  isClient: false,
  clientId: null,
  isOwner,
});

describe('PermissionsGuard', () => {
  it('passes when no permissions are required', () => {
    expect(guardWith(undefined).canActivate(ctxWith(member([])))).toBe(true);
  });

  it('allows a member holding every required permission (all mode)', () => {
    const guard = guardWith(['task.read', 'task.update']);
    expect(guard.canActivate(ctxWith(member(['task.read', 'task.update'])))).toBe(true);
  });

  it('denies a member missing one required permission (all mode)', () => {
    const guard = guardWith(['task.read', 'task.delete']);
    expect(() => guard.canActivate(ctxWith(member(['task.read'])))).toThrow(/permission/i);
  });

  it('allows any-mode when at least one permission is held', () => {
    const guard = guardWith(['finance.read', 'finance.manage'], 'any');
    expect(guard.canActivate(ctxWith(member(['finance.read'])))).toBe(true);
  });

  it('owner bypasses explicit permission checks', () => {
    const guard = guardWith(['automation.manage']);
    expect(guard.canActivate(ctxWith(member([], true)))).toBe(true);
  });

  it('denies when there is no workspace membership context', () => {
    const guard = guardWith(['task.read']);
    expect(() => guard.canActivate(ctxWith(undefined))).toThrow();
  });
});
