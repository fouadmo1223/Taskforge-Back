// Domain enums shared by API + web. Values are stored verbatim in MongoDB.

export const TASK_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Semantic status category. Column-level workflow statuses map onto one of these. */
export const STATUS_CATEGORIES = ['backlog', 'todo', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled'] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const DEPENDENCY_TYPES = [
  'blocks',
  'blocked_by',
  'starts_after',
  'finishes_before',
  'related_to',
  'duplicate_of',
] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export const MILESTONE_STATUSES = ['planned', 'at_risk', 'hit', 'missed'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const COMMENT_VISIBILITY = ['internal', 'external'] as const;
export type CommentVisibility = (typeof COMMENT_VISIBILITY)[number];

export const APPROVAL_DECISIONS = ['approved', 'rejected', 'changes_requested'] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export const APPROVAL_STRATEGIES = ['sequential', 'parallel_all', 'parallel_any', 'n_of_m'] as const;
export type ApprovalStrategy = (typeof APPROVAL_STRATEGIES)[number];

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'changes_requested', 'cancelled'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const TIMER_STATES = ['running', 'paused', 'stopped'] as const;
export type TimerState = (typeof TIMER_STATES)[number];

export const TIMESHEET_STATUSES = ['draft', 'submitted', 'approved', 'rejected'] as const;
export type TimesheetStatus = (typeof TIMESHEET_STATUSES)[number];

export const WORKLOAD_BANDS = ['available', 'healthy', 'near_capacity', 'overloaded'] as const;
export type WorkloadBand = (typeof WORKLOAD_BANDS)[number];

export const RISK_STATUSES = ['open', 'mitigating', 'closed', 'accepted'] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

export const ISSUE_STATUSES = ['open', 'investigating', 'resolved', 'closed'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CHANGE_REQUEST_STATUSES = ['draft', 'submitted', 'in_review', 'approved', 'rejected', 'implemented'] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export const SLA_STATES = ['ok', 'warning', 'breached', 'paused', 'met'] as const;
export type SlaState = (typeof SLA_STATES)[number];

export const EXPENSE_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'reimbursed'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const DECISION_STATUSES = ['proposed', 'accepted', 'rejected', 'superseded'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

/** 5-point qualitative scale for risk probability / impact. */
export const RISK_SCALE = ['very_low', 'low', 'medium', 'high', 'very_high'] as const;
export type RiskScale = (typeof RISK_SCALE)[number];

export const FORM_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'email',
  'phone',
  'date',
  'date_range',
  'checkbox',
  'radio',
  'select',
  'multi_select',
  'file',
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_VISIBILITY = ['public', 'private', 'client'] as const;
export type FormVisibility = (typeof FORM_VISIBILITY)[number];

export const AUTOMATION_TRIGGERS = [
  'task.created',
  'task.updated',
  'task.status_changed',
  'task.overdue',
  'task.due_soon',
  'form.submitted',
  'approval.completed',
  'sla.warning',
  'sla.breached',
  'milestone.completed',
  'schedule',
  'webhook.received',
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

export const AUTOMATION_ACTIONS = [
  'set_field',
  'assign_user',
  'move_task',
  'create_task',
  'create_subtask',
  'add_comment',
  'send_notification',
  'request_approval',
  'call_webhook',
  'apply_template',
] as const;
export type AutomationActionType = (typeof AUTOMATION_ACTIONS)[number];

export const MEMBERSHIP_STATUSES = ['invited', 'active', 'suspended'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

// ── Phase 7: strategy, templates, automation, sharing ────────────────────

export const GOAL_TYPES = ['percent', 'numeric', 'binary'] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_STATUSES = ['on_track', 'at_risk', 'off_track', 'achieved', 'missed'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const TEMPLATE_KINDS = ['project', 'task'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const RECURRENCE_FREQ = ['daily', 'weekly', 'monthly'] as const;
export type RecurrenceFreq = (typeof RECURRENCE_FREQ)[number];

export const DASHBOARD_WIDGET_TYPES = ['stat', 'bar', 'line', 'pie', 'table'] as const;
export type DashboardWidgetType = (typeof DASHBOARD_WIDGET_TYPES)[number];

export const SHARE_RESOURCE_TYPES = ['project', 'dashboard'] as const;
export type ShareResourceType = (typeof SHARE_RESOURCE_TYPES)[number];

export const WEBHOOK_EVENTS = [
  'task.created',
  'task.updated',
  'task.completed',
  'task.deleted',
  'comment.created',
  'approval.completed',
  'form.submitted',
  'milestone.completed',
  'sla.breached',
  'automation.executed',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * Who can see a project (and therefore its boards / tasks):
 *  - `workspace`: every workspace member with `project.read`
 *  - `team`: members of any team listed in the project's `teamIds`
 *  - `private`: only users in the project's `memberUserIds`
 * Managers (`project.create`) and the owner always see everything.
 */
export const PROJECT_VISIBILITY = ['workspace', 'team', 'private'] as const;
export type ProjectVisibility = (typeof PROJECT_VISIBILITY)[number];
