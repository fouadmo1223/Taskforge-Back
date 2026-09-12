import type { SlaState, TaskPriority } from '@flowdesk/types';
import type { TaskDocument } from './schemas/task.schema.js';

export interface ChecklistItemView {
  id: string;
  text: string;
  done: boolean;
  rank: string;
}
export interface ChecklistView {
  id: string;
  title: string;
  rank: string;
  items: ChecklistItemView[];
}

export interface TaskView {
  id: string;
  key: string;
  projectId: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  type: string;
  priority: TaskPriority;
  severity: string | null;
  assigneeUserIds: string[];
  reporterUserId: string;
  followerUserIds: string[];
  labelIds: string[];
  startDate: string | null;
  dueDate: string | null;
  estimateHours: number | null;
  loggedHours: number;
  parentTaskId: string | null;
  depth: number;
  milestoneId: string | null;
  customFields: Record<string, unknown>;
  checklists: ChecklistView[];
  rank: string;
  clientVisible: boolean;
  slaState: SlaState;
  completedAt: string | null;
  commentCount: number;
  attachmentCount: number;
  subtaskCount: number;
  subtaskDoneCount: number;
  createdByUserId: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toTaskView(t: TaskDocument): TaskView {
  return {
    id: t.id,
    key: t.key,
    projectId: t.projectId.toString(),
    boardId: t.boardId.toString(),
    columnId: t.columnId.toString(),
    title: t.title,
    description: t.description,
    type: t.type,
    priority: t.priority,
    severity: t.severity,
    assigneeUserIds: t.assigneeUserIds.map((id) => id.toString()),
    reporterUserId: t.reporterUserId.toString(),
    followerUserIds: t.followerUserIds.map((id) => id.toString()),
    labelIds: t.labelIds.map((id) => id.toString()),
    startDate: t.startDate?.toISOString() ?? null,
    dueDate: t.dueDate?.toISOString() ?? null,
    estimateHours: t.estimateHours,
    loggedHours: t.loggedHours,
    parentTaskId: t.parentTaskId?.toString() ?? null,
    depth: t.depth,
    milestoneId: t.milestoneId?.toString() ?? null,
    customFields: t.customFields ?? {},
    checklists: (t.checklists ?? [])
      .slice()
      .sort((a, b) => (a.rank < b.rank ? -1 : 1))
      .map((c) => ({
        id: c._id.toString(),
        title: c.title,
        rank: c.rank,
        items: (c.items ?? [])
          .slice()
          .sort((a, b) => (a.rank < b.rank ? -1 : 1))
          .map((i) => ({ id: i._id.toString(), text: i.text, done: i.done, rank: i.rank })),
      })),
    rank: t.rank,
    clientVisible: t.clientVisible,
    slaState: t.slaState,
    completedAt: t.completedAt?.toISOString() ?? null,
    commentCount: t.commentCount,
    attachmentCount: t.attachmentCount,
    subtaskCount: t.subtaskCount,
    subtaskDoneCount: t.subtaskDoneCount ?? 0,
    createdByUserId: t.createdByUserId.toString(),
    archived: t.archivedAt !== null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
