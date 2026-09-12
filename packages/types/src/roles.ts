import { PERMISSIONS, type Permission } from './permissions.js';

/**
 * System role presets. Every workspace is seeded with these on creation; they are
 * editable except `owner`, which always holds every permission.
 */
export type SystemRoleKey = 'owner' | 'admin' | 'manager' | 'member' | 'contributor' | 'client' | 'guest';

export interface RolePreset {
  key: SystemRoleKey;
  name: string;
  description: string;
  system: true;
  /** `owner` is represented by the wildcard; others list explicit permissions. */
  permissions: Permission[] | '*';
}

const managerPerms: Permission[] = [
  'workspace.read',
  'members.read',
  'members.invite',
  'team.manage',
  'project.create',
  'project.read',
  'project.update',
  'project.archive',
  'board.manage',
  'board.read',
  'task.create',
  'task.read',
  'task.update',
  'task.delete',
  'task.assign',
  'task.move',
  'comment.create',
  'comment.read',
  'comment.moderate',
  'comment.external',
  'dependency.manage',
  'milestone.manage',
  'time.log',
  'time.read',
  'timesheet.approve',
  'workload.read',
  'resource.manage',
  'availability.manage',
  'finance.read',
  'client.read',
  'client.manage',
  'portal.manage',
  'form.manage',
  'form.read',
  'request.read',
  'request.manage',
  'approval.request',
  'approval.approve',
  'risk.manage',
  'issue.manage',
  'decision.manage',
  'change.manage',
  'sla.manage',
  'goal.manage',
  'template.manage',
  'report.read',
];

const memberPerms: Permission[] = [
  'workspace.read',
  'members.read',
  'project.read',
  'board.read',
  'task.create',
  'task.read',
  'task.update',
  'task.assign',
  'task.move',
  'comment.create',
  'comment.read',
  'dependency.manage',
  'milestone.manage',
  'time.log',
  'time.read',
  'timesheet.submit',
  'workload.read',
  'request.read',
  'approval.request',
  'risk.manage',
  'issue.manage',
];

const contributorPerms: Permission[] = [
  'workspace.read',
  'members.read',
  'project.read',
  'board.read',
  'task.read',
  'task.update',
  'task.move',
  'comment.create',
  'comment.read',
  'time.log',
  'time.read',
  'timesheet.submit',
];

const clientPerms: Permission[] = ['portal.manage', 'approval.approve', 'comment.create', 'comment.read'];

export const ROLE_PRESETS: RolePreset[] = [
  { key: 'owner', name: 'Owner', description: 'Full control of the workspace.', system: true, permissions: '*' },
  {
    key: 'admin',
    name: 'Admin',
    description: 'Manages the workspace, members, roles, and settings.',
    system: true,
    permissions: [...PERMISSIONS],
  },
  {
    key: 'manager',
    name: 'Project Manager',
    description: 'Runs projects end to end, including finance visibility and approvals.',
    system: true,
    permissions: managerPerms,
  },
  {
    key: 'member',
    name: 'Team Member',
    description: 'Works on tasks, logs time, raises risks and issues.',
    system: true,
    permissions: memberPerms,
  },
  {
    key: 'contributor',
    name: 'Contributor',
    description: 'Limited access to assigned work only.',
    system: true,
    permissions: contributorPerms,
  },
  {
    key: 'client',
    name: 'Client',
    description: 'External stakeholder with client-portal access only.',
    system: true,
    permissions: clientPerms,
  },
  {
    key: 'guest',
    name: 'Guest',
    description: 'Read-only access to explicitly shared items.',
    system: true,
    permissions: ['workspace.read', 'project.read', 'board.read', 'task.read', 'comment.read'],
  },
];

export function resolvePresetPermissions(preset: RolePreset): Permission[] {
  return preset.permissions === '*' ? [...PERMISSIONS] : preset.permissions;
}
