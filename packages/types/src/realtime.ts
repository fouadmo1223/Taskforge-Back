/**
 * Realtime channel naming. Delivery is via a managed pub/sub service (Ably) so
 * the API can publish from stateless serverless functions. Authorization is
 * enforced when the per-user Ably token is minted (capability = the exact set of
 * channels the user may attach to) and re-checked server-side on publish.
 */
export const channels = {
  workspace: (id: string) => `workspace:${id}`,
  project: (id: string) => `project:${id}`,
  board: (id: string) => `board:${id}`,
  task: (id: string) => `task:${id}`,
  user: (id: string) => `user:${id}`,
  conversation: (id: string) => `chat:${id}`,
} as const;

/** Back-compat alias — earlier phases import `rooms`. */
export const rooms = channels;

export const REALTIME_EVENTS = [
  'project.created',
  'project.updated',
  'project.deleted',
  'board.updated',
  'task.created',
  'task.updated',
  'task.moved',
  'task.deleted',
  'column.created',
  'column.updated',
  'column.deleted',
  'column.reordered',
  'comment.created',
  'comment.updated',
  'comment.deleted',
  'label.updated',
  'milestone.updated',
  'dependency.updated',
  'approval.updated',
  'request.created',
  'request.updated',
  'deliverable.updated',
  'form.updated',
  'budget.updated',
  'expense.updated',
  'risk.updated',
  'issue.updated',
  'decision.updated',
  'change_request.updated',
  'sla.updated',
  'portfolio.updated',
  'goal.updated',
  'team.updated',
  'dashboard.updated',
  'automation.updated',
  'notification.created',
  'presence.updated',
  // chat
  'chat.message',
  'chat.message_updated',
  'chat.message_deleted',
  'chat.conversation_updated',
  'chat.typing',
  'chat.read',
] as const;

export type RealtimeEvent = (typeof REALTIME_EVENTS)[number];

export interface RealtimeMessage<T = unknown> {
  event: RealtimeEvent;
  /** channel the event was published to */
  room: string;
  /** id of the actor who caused it, for client-side echo suppression */
  actorId: string | null;
  at: string;
  payload: T;
}
