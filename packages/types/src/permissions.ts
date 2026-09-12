/**
 * Central permission catalog. The backend enforces these; the frontend uses the
 * same list to decide what to render. Never treat the frontend copy as authoritative.
 */
export const PERMISSIONS = [
  // workspace / members / roles
  'workspace.manage',
  'workspace.read',
  'members.invite',
  'members.remove',
  'members.read',
  'roles.manage',
  'team.manage',

  // projects
  'project.create',
  'project.read',
  'project.update',
  'project.delete',
  'project.archive',

  // boards / columns
  'board.manage',
  'board.read',

  // tasks
  'task.create',
  'task.read',
  'task.update',
  'task.delete',
  'task.assign',
  'task.move',

  // comments
  'comment.create',
  'comment.read',
  'comment.moderate',
  'comment.external', // may post client-visible comments

  // dependencies / milestones
  'dependency.manage',
  'milestone.manage',

  // time tracking
  'time.log',
  'time.read',
  'timesheet.submit',
  'timesheet.approve',

  // workload / resources / availability
  'workload.read',
  'resource.manage',
  'availability.manage',

  // finance
  'finance.read',
  'finance.manage',

  // clients / portal
  'client.read',
  'client.manage',
  'portal.manage',

  // forms / requests
  'form.manage',
  'form.read',
  'request.read',
  'request.manage',

  // approvals
  'approval.request',
  'approval.approve',

  // risks / issues / decisions / change requests
  'risk.manage',
  'issue.manage',
  'decision.manage',
  'change.manage',

  // sla / escalations
  'sla.manage',

  // portfolios / goals
  'portfolio.manage',
  'goal.manage',

  // automations / webhooks / api tokens
  'automation.manage',
  'webhook.manage',
  'apitoken.manage',

  // templates
  'template.manage',

  // audit / activity / reports
  'audit.read',
  'report.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface PermissionGroup {
  key: string;
  permissions: Permission[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  { key: 'workspace', permissions: ['workspace.manage', 'workspace.read'] },
  { key: 'members', permissions: ['members.invite', 'members.remove', 'members.read', 'roles.manage', 'team.manage'] },
  {
    key: 'projects',
    permissions: ['project.create', 'project.read', 'project.update', 'project.delete', 'project.archive'],
  },
  { key: 'boards', permissions: ['board.manage', 'board.read'] },
  {
    key: 'tasks',
    permissions: ['task.create', 'task.read', 'task.update', 'task.delete', 'task.assign', 'task.move'],
  },
  { key: 'comments', permissions: ['comment.create', 'comment.read', 'comment.moderate', 'comment.external'] },
  { key: 'planning', permissions: ['dependency.manage', 'milestone.manage'] },
  { key: 'time', permissions: ['time.log', 'time.read', 'timesheet.submit', 'timesheet.approve'] },
  { key: 'resourcing', permissions: ['workload.read', 'resource.manage', 'availability.manage'] },
  { key: 'finance', permissions: ['finance.read', 'finance.manage'] },
  { key: 'clients', permissions: ['client.read', 'client.manage', 'portal.manage'] },
  { key: 'intake', permissions: ['form.manage', 'form.read', 'request.read', 'request.manage'] },
  { key: 'approvals', permissions: ['approval.request', 'approval.approve'] },
  {
    key: 'governance',
    permissions: ['risk.manage', 'issue.manage', 'decision.manage', 'change.manage', 'sla.manage'],
  },
  { key: 'strategy', permissions: ['portfolio.manage', 'goal.manage'] },
  { key: 'system', permissions: ['automation.manage', 'webhook.manage', 'apitoken.manage', 'template.manage'] },
  { key: 'oversight', permissions: ['audit.read', 'report.read'] },
];

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}
