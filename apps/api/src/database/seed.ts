/**
 * Standalone seed. Talks to MongoDB directly (no Nest / Redis needed).
 *
 *   pnpm --filter @flowdesk/api seed
 *
 * Creates:
 *  - the original single demo account (owner@flowdesk.local / Acme Inc), kept
 *    for backward compatibility;
 *  - TWO fully-populated demo companies, each with an owner, a team lead and a
 *    member account plus extra teammates, and enough projects / tasks / clients
 *    / milestones / goals etc. that every list in the UI shows 20+ rows.
 *
 * The two demo companies are wiped and rebuilt on every run so counts stay
 * predictable; the original Acme account is only ever upserted.
 */
import 'dotenv/config';
import * as argon2 from 'argon2';
import mongoose from 'mongoose';
import { ROLE_PRESETS, resolvePresetPermissions } from '@flowdesk/types';

type Db = mongoose.mongo.Db;
type Collection = mongoose.mongo.Collection;
import { rankAfter, slugify } from '@flowdesk/utils';

const PASSWORD = 'Passw0rd!2024';
const oid = (): mongoose.Types.ObjectId => new mongoose.Types.ObjectId();
const pick = <T>(arr: readonly T[], i: number): T => arr[i % arr.length]!;
const daysFromNow = (n: number): Date => new Date(Date.now() + n * 864e5);

// ── deterministic content pools ────────────────────────────────────────────
const FIRST = ['Aya', 'Sam', 'Noor', 'Omar', 'Lina', 'Youssef', 'Hana', 'Karim', 'Dina', 'Tarek', 'Rana', 'Adam', 'Salma', 'Nabil', 'Farah', 'Ziad'];
const LAST = ['Hassan', 'Farouk', 'Said', 'Nasser', 'Khalil', 'Mansour', 'Rashad', 'Sabry', 'Zaki', 'Halim', 'Fawzy', 'Ghali'];
const TEAM_NAMES = ['Engineering', 'Design', 'Marketing', 'Operations', 'Customer Success', 'Finance', 'Product'];
const TEAM_COLORS = ['#2563eb', '#db2777', '#d97706', '#0d9488', '#7c3aed', '#16a34a', '#ea580c'];
const PROJECT_NAMES = [
  'Website Redesign', 'Mobile App v2', 'Q3 Campaign', 'Data Warehouse', 'Billing Overhaul',
  'Onboarding Revamp', 'Support Portal', 'Brand Refresh', 'API Platform', 'Analytics Suite',
  'Security Hardening', 'Partner Integrations', 'Internal Tools', 'Content Migration',
];
const PROJECT_COLORS = ['#4f46e5', '#2563eb', '#0ea5e9', '#0d9488', '#16a34a', '#65a30d', '#d97706', '#ea580c', '#dc2626', '#db2777', '#7c3aed', '#64748b'];
const PROJECT_STATUS = ['planning', 'active', 'active', 'active', 'on_hold', 'completed'];
const COLUMN_SET: Array<{ name: string; statusCategory: string; color: string | null; wipLimit: number }> = [
  { name: 'Backlog', statusCategory: 'backlog', color: null, wipLimit: 0 },
  { name: 'To Do', statusCategory: 'todo', color: '#2563eb', wipLimit: 0 },
  { name: 'In Progress', statusCategory: 'in_progress', color: '#6366f1', wipLimit: 4 },
  { name: 'In Review', statusCategory: 'in_review', color: '#d97706', wipLimit: 3 },
  { name: 'Blocked', statusCategory: 'blocked', color: '#dc2626', wipLimit: 0 },
  { name: 'Done', statusCategory: 'done', color: '#16a34a', wipLimit: 0 },
];
const TASK_VERBS = ['Implement', 'Fix', 'Design', 'Review', 'Refactor', 'Document', 'Investigate', 'Ship', 'Plan', 'Test', 'Migrate', 'Polish'];
const TASK_NOUNS = ['login flow', 'dashboard widgets', 'export pipeline', 'search index', 'email templates', 'rate limiter', 'audit log', 'onboarding tour', 'payment webhook', 'report builder', 'nav sidebar', 'notification center', 'file uploads', 'permission checks', 'timeline view', 'settings page'];
const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'];
const LABEL_NAMES = ['bug', 'feature', 'chore', 'design', 'backend', 'frontend', 'urgent', 'blocked', 'research', 'docs', 'tech-debt', 'customer', 'q3', 'nice-to-have'];
const LABEL_COLORS = ['#dc2626', '#2563eb', '#64748b', '#db2777', '#0d9488', '#6366f1', '#ea580c', '#b91c1c', '#7c3aed', '#0ea5e9', '#a16207', '#16a34a', '#d97706', '#4b5563'];
const CLIENT_NAMES = ['Globex', 'Initech', 'Umbrella Retail', 'Soylent Corp', 'Massive Dynamic', 'Stark Supplies', 'Wayne Foods', 'Wonka Ltd', 'Acme Rockets', 'Cyberdyne', 'Tyrell Co', 'Hooli', 'Pied Piper', 'Prestige Worldwide', 'Vehement Capital', 'Bluth Company', 'Dunder Mifflin', 'Gekko & Co', 'Oscorp', 'Nakatomi', 'Weyland', 'Aperture'];
const MILESTONE_NAMES = ['Kickoff', 'Alpha', 'Beta', 'Feature freeze', 'Launch', 'Post-launch review'];
const GOAL_TITLES = ['Grow MRR', 'Reduce churn', 'Ship v2', 'Improve NPS', 'Cut cloud spend', 'Hire 5 engineers', 'Lift activation', 'Expand to EU', 'Automate onboarding', 'Reach SOC2', 'Double pipeline', 'Reduce p95 latency'];

interface CompanySpec {
  name: string;
  domain: string;
  owner: string;
  lead: string;
  member: string;
}

async function upsertUser(users: Collection, name: string, email: string, hash: string, locale: 'en' | 'ar'): Promise<mongoose.Types.ObjectId> {
  const now = new Date();
  const existing = await users.findOne({ email });
  if (existing) return existing._id as mongoose.Types.ObjectId;
  const res = await users.insertOne({
    name, email, passwordHash: hash, emailVerified: true, avatar: null,
    locale, theme: 'system', timezone: null, lastLoginAt: null, isSuspended: false,
    tokenEpoch: 0, createdAt: now, updatedAt: now,
  });
  return res.insertedId as mongoose.Types.ObjectId;
}

async function seedCompany(db: Db, spec: CompanySpec, hash: string): Promise<void> {
  const users = db.collection('users');
  const workspaces = db.collection('workspaces');
  const roles = db.collection('roles');
  const memberships = db.collection('workspace_memberships');
  const now = new Date();
  const locale: 'en' | 'ar' = spec.domain === 'northwind.test' ? 'en' : 'ar';

  // principals + extra teammates
  const ownerId = await upsertUser(users, `${spec.name} Owner`, spec.owner, hash, locale);
  const leadId = await upsertUser(users, `${spec.name} Lead`, spec.lead, hash, locale);
  const memberId = await upsertUser(users, `${spec.name} Member`, spec.member, hash, locale);
  const extraIds: mongoose.Types.ObjectId[] = [];
  for (let i = 0; i < 17; i += 1) {
    const nm = `${pick(FIRST, i + 3)} ${pick(LAST, i)}`;
    const em = `${slugify(nm)}-${i + 1}@${spec.domain}`;
    extraIds.push(await upsertUser(users, nm, em, hash, locale));
  }
  const staff = [ownerId, leadId, memberId, ...extraIds];

  // workspace
  const slug = slugify(spec.name);
  await workspaces.deleteMany({ slug });
  const wsRes = await workspaces.insertOne({
    name: spec.name, slug, ownerUserId: ownerId, logo: null,
    settings: {
      primaryColor: null, secondaryColor: null, defaultLocale: locale, timezone: 'UTC',
      allowConcurrentTimers: false, clientsSeeFinance: false,
    },
    deletedAt: null, deletedBy: null, createdAt: now, updatedAt: now,
  });
  const wsId = wsRes.insertedId as mongoose.Types.ObjectId;

  // roles
  await roles.deleteMany({ workspaceId: wsId });
  const roleDocs = ROLE_PRESETS.map((preset) => ({
    workspaceId: wsId, key: preset.key, name: preset.name, description: preset.description,
    permissions: resolvePresetPermissions(preset), system: true,
    isOwner: preset.key === 'owner', isDefault: preset.key === 'member',
    createdAt: now, updatedAt: now,
  }));
  const roleRes = await roles.insertMany(roleDocs);
  const roleId = (key: string): mongoose.Types.ObjectId =>
    roleRes.insertedIds[ROLE_PRESETS.findIndex((p) => p.key === key)] as mongoose.Types.ObjectId;
  const ownerRole = roleId('owner');
  const managerRole = roleId('manager');
  const memberRole = roleId('member');

  // memberships
  await memberships.deleteMany({ workspaceId: wsId });
  const membershipDocs = staff.map((uid, i) => ({
    workspaceId: wsId, userId: uid,
    roleId: uid.equals(ownerId) ? ownerRole : uid.equals(leadId) ? managerRole : memberRole,
    status: 'active', isClient: false, clientId: null, invitedEmail: null,
    invitedByUserId: i === 0 ? null : ownerId, inviteTokenHash: null, inviteExpiresAt: null,
    joinedAt: now, createdAt: now, updatedAt: now,
  }));
  await memberships.insertMany(membershipDocs);

  // wipe content collections for this workspace
  const contentCols = ['teams', 'clients', 'projects', 'boards', 'board_columns', 'labels', 'milestones', 'tasks', 'comments', 'activity_events', 'goals', 'portfolios'];
  for (const c of contentCols) await db.collection(c).deleteMany({ workspaceId: wsId });

  // teams — lead owns the first, is a member of all
  const teams = db.collection('teams');
  const teamDocs = Array.from({ length: 20 }, (_, i) => ({
    _id: oid(), workspaceId: wsId,
    name: i < TEAM_NAMES.length ? TEAM_NAMES[i]! : `Squad ${i + 1}`,
    description: 'Demo team', color: pick(TEAM_COLORS, i),
    leadUserId: i === 0 ? leadId : pick(staff, i + 1),
    memberUserIds: [...new Set([leadId, ...staff.filter((_, j) => j % 20 === i % 20), pick(staff, i)])],
    createdByUserId: ownerId, archivedAt: null, createdAt: now, updatedAt: now,
  }));
  await teams.insertMany(teamDocs);

  // clients
  const clients = db.collection('clients');
  const clientDocs = CLIENT_NAMES.map((cn, i) => ({
    _id: oid(), workspaceId: wsId, name: `${cn}`, logo: null,
    contactName: `${pick(FIRST, i)} ${pick(LAST, i)}`,
    contactEmail: `hello@${slugify(cn)}.example`,
    contactPhone: `+1 555 01${String(10 + i).padStart(2, '0')}`,
    website: `https://${slugify(cn)}.example`, notes: '',
    status: i % 7 === 0 ? 'archived' : 'active', projectIds: [],
    createdByUserId: ownerId, deletedAt: null, createdAt: now, updatedAt: now,
  }));
  await clients.insertMany(clientDocs);

  // labels (workspace-wide)
  const labels = db.collection('labels');
  await labels.insertMany(Array.from({ length: 22 }, (_, i) => ({
    _id: oid(), workspaceId: wsId, projectId: null,
    name: i < LABEL_NAMES.length ? LABEL_NAMES[i]! : `tag-${i + 1}`,
    color: pick(LABEL_COLORS, i), createdAt: now, updatedAt: now,
  })));

  // projects + boards + columns + milestones + tasks + comments + activity
  const projects = db.collection('projects');
  const boards = db.collection('boards');
  const columns = db.collection('board_columns');
  const milestones = db.collection('milestones');
  const tasks = db.collection('tasks');
  const comments = db.collection('comments');
  const activity = db.collection('activity_events');

  const projectIds: mongoose.Types.ObjectId[] = [];
  let projRank = rankAfter(null);
  const PROJECT_COUNT = 20;

  for (let p = 0; p < PROJECT_COUNT; p += 1) {
    const projId = oid();
    projectIds.push(projId);
    const projectName = p < PROJECT_NAMES.length ? PROJECT_NAMES[p]! : `Initiative ${p + 1}`;
    const key = (projectName.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() + (p + 10)).slice(0, 6);
    const members = staff.filter((_, j) => (j + p) % 2 === 0);
    const status = pick(PROJECT_STATUS, p);
    let taskCounter = 0;

    const boardId = oid();
    let colRank = rankAfter(null);
    const colIds: mongoose.Types.ObjectId[] = [];
    const colDocs = COLUMN_SET.map((c) => {
      const _id = oid();
      colIds.push(_id);
      colRank = rankAfter(colRank);
      return {
        _id, workspaceId: wsId, boardId, projectId: projId, name: c.name,
        statusCategory: c.statusCategory, color: c.color, rank: colRank, wipLimit: c.wipLimit,
        createdAt: now, updatedAt: now,
      };
    });

    // tasks: ~16 per project, spread across columns
    const taskCount = 14 + (p % 5);
    const taskDocs: Record<string, unknown>[] = [];
    const activityDocs: Record<string, unknown>[] = [];
    const commentDocs: Record<string, unknown>[] = [];
    const rankByCol = new Map<string, string>();
    const madeTaskIds: mongoose.Types.ObjectId[] = [];

    for (let ti = 0; ti < taskCount; ti += 1) {
      taskCounter += 1;
      const colIdx = ti % COLUMN_SET.length;
      const col = COLUMN_SET[colIdx]!;
      const colId = colIds[colIdx]!;
      const prevRank = rankByCol.get(colId.toString()) ?? null;
      const rank = rankAfter(prevRank);
      rankByCol.set(colId.toString(), rank);

      const _id = oid();
      madeTaskIds.push(_id);
      const done = col.statusCategory === 'done';
      const hasDates = ti % 3 !== 0;
      const start = daysFromNow(-20 + ti * 2);
      const due = daysFromNow(-20 + ti * 2 + 3 + (ti % 4));
      const assignee = pick(staff, ti + p);

      taskDocs.push({
        _id, workspaceId: wsId, projectId: projId, boardId, columnId: colId,
        key: `${key}-${taskCounter}`,
        title: `${pick(TASK_VERBS, ti)} ${pick(TASK_NOUNS, ti + p)}`,
        description: '', type: 'task', priority: pick(PRIORITIES, ti + p),
        severity: null, assigneeUserIds: [assignee], reporterUserId: ownerId,
        followerUserIds: [assignee], labelIds: [], startDate: hasDates ? start : null,
        dueDate: hasDates ? due : null, estimateHours: ti % 2 === 0 ? (ti % 8) + 1 : null,
        loggedHours: done ? (ti % 5) + 1 : 0, parentTaskId: null, depth: 0,
        milestoneId: null, customFields: {}, checklists: [], rank,
        clientVisible: ti % 6 === 0, slaState: 'ok',
        completedAt: done ? daysFromNow(-2 - (ti % 5)) : null,
        commentCount: 0, attachmentCount: 0, subtaskCount: 0, subtaskDoneCount: 0,
        createdByUserId: ownerId, archivedAt: null, deletedAt: null, deletedBy: null,
        createdAt: daysFromNow(-30 + ti), updatedAt: now,
      });

      activityDocs.push({
        workspaceId: wsId, projectId: projId, taskId: _id, actorUserId: ownerId,
        verb: 'task.created', entityType: 'task', entityId: _id.toString(),
        entityTitle: `${key}-${taskCounter}`, meta: {}, createdAt: daysFromNow(-30 + ti),
      });

      if (ti < 4) {
        for (let ci = 0; ci <= ti % 3; ci += 1) {
          commentDocs.push({
            workspaceId: wsId, projectId: projId, taskId: _id,
            authorUserId: pick(staff, ci + ti), bodyHtml: `<p>Comment ${ci + 1} on this task.</p>`,
            bodyText: `Comment ${ci + 1} on this task.`, visibility: 'internal',
            mentionUserIds: [], editedAt: null, deletedAt: null,
            createdAt: daysFromNow(-10 + ti + ci), updatedAt: now,
          });
        }
      }
    }

    // two subtasks under the first task
    const parent = madeTaskIds[0]!;
    for (let s = 0; s < 2; s += 1) {
      taskCounter += 1;
      const _id = oid();
      const colId = colIds[1]!;
      const prevRank = rankByCol.get(colId.toString()) ?? null;
      const rank = rankAfter(prevRank);
      rankByCol.set(colId.toString(), rank);
      taskDocs.push({
        _id, workspaceId: wsId, projectId: projId, boardId, columnId: colId,
        key: `${key}-${taskCounter}`, title: `${pick(TASK_VERBS, s)} sub-item ${s + 1}`,
        description: '', type: 'task', priority: 'low', severity: null,
        assigneeUserIds: [pick(staff, s)], reporterUserId: ownerId, followerUserIds: [],
        labelIds: [], startDate: null, dueDate: null, estimateHours: null, loggedHours: 0,
        parentTaskId: parent, depth: 1, milestoneId: null, customFields: {}, checklists: [],
        rank, clientVisible: false, slaState: 'ok', completedAt: s === 0 ? daysFromNow(-1) : null,
        commentCount: 0, attachmentCount: 0, subtaskCount: 0, subtaskDoneCount: 0,
        createdByUserId: ownerId, archivedAt: null, deletedAt: null, deletedBy: null,
        createdAt: daysFromNow(-5), updatedAt: now,
      });
    }
    // reflect the subtask rollup on the parent
    taskDocs[0]!.subtaskCount = 2;
    taskDocs[0]!.subtaskDoneCount = 1;

    projRank = rankAfter(projRank);
    await projects.insertOne({
      _id: projId, workspaceId: wsId, key, name: projectName, description: `${projectName} — demo project.`,
      status, color: pick(PROJECT_COLORS, p), cover: null,
      leadUserId: leadId, memberUserIds: members,
      visibility: p % 5 === 0 ? 'team' : 'workspace',
      teamIds: p % 5 === 0 ? [teamDocs[p % teamDocs.length]!._id] : [],
      startDate: daysFromNow(-30), endDate: daysFromNow(60), taskCounter,
      createdByUserId: ownerId, archivedAt: null, deletedAt: null, deletedBy: null,
      createdAt: daysFromNow(-40), updatedAt: now,
    });
    await boards.insertOne({
      _id: boardId, workspaceId: wsId, projectId: projId, name: 'Delivery board',
      isDefault: true, rank: rankAfter(null), archivedAt: null, createdAt: now, updatedAt: now,
    });
    await columns.insertMany(colDocs);
    await tasks.insertMany(taskDocs);
    if (commentDocs.length) await comments.insertMany(commentDocs);
    await activity.insertMany(activityDocs);

    await milestones.insertMany(
      MILESTONE_NAMES.slice(0, 3).map((mn, mi) => ({
        _id: oid(), workspaceId: wsId, projectId: projId, name: `${mn}`,
        description: '', ownerUserId: leadId, date: daysFromNow(-10 + mi * 21),
        status: mi === 0 ? 'hit' : mi === 1 ? 'at_risk' : 'planned',
        taskIds: [], deletedAt: null, createdAt: now, updatedAt: now,
      })),
    );

    // link some clients to projects
    if (p < CLIENT_NAMES.length) {
      await clients.updateOne({ _id: clientDocs[p]!._id }, { $push: { projectIds: projId } } as Record<string, unknown>);
    }
  }

  // portfolios
  const PF_NAMES = ['Core Products', 'Growth', 'Platform', 'Internal', 'Customer', 'Innovation', 'Compliance', 'Data', 'Mobile', 'Web'];
  await db.collection('portfolios').insertMany(
    Array.from({ length: 20 }, (_, i) => ({
      _id: oid(), workspaceId: wsId,
      name: i < PF_NAMES.length ? PF_NAMES[i]! : `Program ${i + 1}`, description: 'Demo portfolio',
      color: pick(PROJECT_COLORS, i + 2),
      projectIds: projectIds.filter((_, j) => j % 20 === i),
      ownerUserId: ownerId, createdByUserId: ownerId, archivedAt: null, createdAt: now, updatedAt: now,
    })),
  );

  // goals
  await db.collection('goals').insertMany(
    Array.from({ length: 20 }, (_, i) => ({
      _id: oid(), workspaceId: wsId, title: i < GOAL_TITLES.length ? GOAL_TITLES[i]! : `Objective ${i + 1}`, description: '',
      type: pick(['percent', 'numeric', 'binary'] as const, i),
      start: 0, target: i % 3 === 1 ? 40 : 100, current: (i * 13) % 90, unit: i % 3 === 1 ? 'k' : '%',
      status: pick(['on_track', 'at_risk', 'off_track', 'achieved'] as const, i),
      ownerUserId: pick(staff, i), portfolioId: null, projectId: i < projectIds.length ? projectIds[i]! : null,
      parentGoalId: null,
      keyResults: [
        { _id: oid(), title: 'KR 1', start: 0, target: 100, current: (i * 20) % 100, unit: '%' },
        { _id: oid(), title: 'KR 2', start: 0, target: 100, current: (i * 30) % 100, unit: '%' },
      ],
      dueDate: daysFromNow(45 + i), closedAt: null,
      createdByUserId: ownerId, createdAt: now, updatedAt: now,
    })),
  );

  const counts = await Promise.all(
    ['workspace_memberships', 'teams', 'clients', 'projects', 'boards', 'board_columns', 'labels', 'milestones', 'tasks', 'comments', 'activity_events', 'goals', 'portfolios'].map(
      async (c) => `${c}=${await db.collection(c).countDocuments({ workspaceId: wsId })}`,
    ),
  );
  console.log(`\n+ "${spec.name}" (/${slug})  owner:${spec.owner}  lead:${spec.lead}  member:${spec.member}`);
  console.log(`  ${counts.join('  ')}`);
}

// ── original minimal Acme account (kept for compatibility) ─────────────────
async function seedAcme(db: Db, hash: string): Promise<void> {
  const users = db.collection('users');
  const workspaces = db.collection('workspaces');
  const roles = db.collection('roles');
  const memberships = db.collection('workspace_memberships');
  const now = new Date();

  const email = 'owner@flowdesk.local';
  let user = await users.findOne({ email });
  if (!user) {
    const res = await users.insertOne({
      name: 'Ada Owner', email, passwordHash: hash, emailVerified: true, avatar: null,
      locale: 'en', theme: 'system', timezone: null, lastLoginAt: null, isSuspended: false,
      tokenEpoch: 0, createdAt: now, updatedAt: now,
    });
    user = await users.findOne({ _id: res.insertedId });
  }
  const slug = slugify('Acme Inc');
  let workspace = await workspaces.findOne({ slug });
  if (!workspace) {
    const res = await workspaces.insertOne({
      name: 'Acme Inc', slug, ownerUserId: user!._id, logo: null,
      settings: { primaryColor: null, secondaryColor: null, defaultLocale: 'en', timezone: 'UTC', allowConcurrentTimers: false, clientsSeeFinance: false },
      deletedAt: null, deletedBy: null, createdAt: now, updatedAt: now,
    });
    workspace = await workspaces.findOne({ _id: res.insertedId });
  }
  if (await roles.countDocuments({ workspaceId: workspace!._id }) === 0) {
    await roles.insertMany(ROLE_PRESETS.map((preset) => ({
      workspaceId: workspace!._id, key: preset.key, name: preset.name, description: preset.description,
      permissions: resolvePresetPermissions(preset), system: true,
      isOwner: preset.key === 'owner', isDefault: preset.key === 'member', createdAt: now, updatedAt: now,
    })));
  }
  const ownerRole = await roles.findOne({ workspaceId: workspace!._id, isOwner: true });
  if (!(await memberships.findOne({ workspaceId: workspace!._id, userId: user!._id }))) {
    await memberships.insertOne({
      workspaceId: workspace!._id, userId: user!._id, roleId: ownerRole!._id, status: 'active',
      isClient: false, clientId: null, invitedEmail: null, invitedByUserId: null, inviteTokenHash: null,
      inviteExpiresAt: null, joinedAt: now, createdAt: now, updatedAt: now,
    });
  }
  console.log(`= Acme Inc ready (owner@flowdesk.local / ${PASSWORD})`);
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set (expected in apps/api/.env)');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const db = mongoose.connection.db;
  if (!db) throw new Error('no database handle');

  const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });

  await seedAcme(db, hash);
  await seedCompany(db, { name: 'Northwind Group', domain: 'northwind.test', owner: 'owner@northwind.test', lead: 'lead@northwind.test', member: 'member@northwind.test' }, hash);
  await seedCompany(db, { name: 'Umbrella Corp', domain: 'umbrella.test', owner: 'owner@umbrella.test', lead: 'lead@umbrella.test', member: 'member@umbrella.test' }, hash);

  await mongoose.disconnect();
  console.log(`\nSeed complete. Every account's password is: ${PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
