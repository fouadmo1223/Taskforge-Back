import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { CloudinaryAsset, CursorPage } from '@flowdesk/types';
import { cursor, cursorPage } from '../../common/db/pagination.js';
import { ApiException } from '../../common/http/api-exception.js';
import { MembershipsService } from '../memberships/memberships.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { Conversation, type ConversationDocument } from './schemas/conversation.schema.js';
import { ChatMessage, ChatRead, type ChatMessageDocument, type ChatReadDocument } from './schemas/chat-message.schema.js';

export interface ConversationView {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  memberUserIds: string[];
  createdByUserId: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageSenderUserId: string | null;
  unreadCount: number;
}

export interface MessageReactionView {
  emoji: string;
  userIds: string[];
}

export interface ChatMessageView {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  attachment: CloudinaryAsset | null;
  mentionUserIds: string[];
  edited: boolean;
  forwardedFromUserId: string | null;
  reactions: MessageReactionView[];
  createdAt: string;
}

function preview(body: string): string {
  return body.replace(/\s+/g, ' ').trim().slice(0, 140);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches the client's own editable/deletable-for-everyone window. */
const EDIT_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Conversation.name) private readonly conversations: Model<ConversationDocument>,
    @InjectModel(ChatMessage.name) private readonly messages: Model<ChatMessageDocument>,
    @InjectModel(ChatRead.name) private readonly reads: Model<ChatReadDocument>,
    private readonly memberships: MembershipsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  // ── conversations ───────────────────────────────────────────────────────

  async list(workspaceId: string, userId: string): Promise<ConversationView[]> {
    const uid = new Types.ObjectId(userId);
    const rows = await this.conversations
      .find({ workspaceId: new Types.ObjectId(workspaceId), memberUserIds: uid })
      .sort({ lastMessageAt: -1 })
      .limit(200)
      .exec();

    const readRows = await this.reads.find({ userId: uid, conversationId: { $in: rows.map((r) => r._id) } }).lean();
    const readByConvo = new Map(readRows.map((r) => [r.conversationId.toString(), r.lastReadAt]));

    const unreadCounts = await Promise.all(
      rows.map((r) => {
        const since = readByConvo.get(r.id) ?? new Date(0);
        return this.messages.countDocuments({
          conversationId: r._id,
          deletedAt: null,
          senderUserId: { $ne: uid },
          createdAt: { $gt: since },
        });
      }),
    );

    return rows.map((r, i) => this.conversationView(r, unreadCounts[i] ?? 0));
  }

  async getOrThrow(workspaceId: string, conversationId: string, userId: string): Promise<ConversationDocument> {
    const convo = await this.conversations
      .findOne({ _id: conversationId, workspaceId: new Types.ObjectId(workspaceId), memberUserIds: new Types.ObjectId(userId) })
      .exec();
    if (!convo) throw ApiException.notFound('Conversation');
    return convo;
  }

  async getOrCreateDirect(workspaceId: string, userId: string, otherUserId: string): Promise<ConversationDocument> {
    if (userId === otherUserId) throw ApiException.validation('You cannot message yourself.');
    await this.assertMember(workspaceId, otherUserId);

    const pair = [userId, otherUserId].sort();
    const directKey = `w:${pair[0]}:${pair[1]}`;
    const existing = await this.conversations.findOne({ workspaceId: new Types.ObjectId(workspaceId), directKey }).exec();
    if (existing) return existing;

    try {
      const convo = await this.conversations.create({
        workspaceId: new Types.ObjectId(workspaceId),
        type: 'direct',
        name: null,
        memberUserIds: pair.map((id) => new Types.ObjectId(id)),
        createdByUserId: new Types.ObjectId(userId),
        directKey,
      });
      this.notifyConversationChanged(convo, [otherUserId]);
      return convo;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        return this.conversations.findOne({ workspaceId: new Types.ObjectId(workspaceId), directKey }).exec() as Promise<ConversationDocument>;
      }
      throw err;
    }
  }

  async createGroup(workspaceId: string, userId: string, name: string, memberUserIds: string[]): Promise<ConversationDocument> {
    const members = [...new Set([userId, ...memberUserIds])];
    if (members.length < 2) throw ApiException.validation('A group needs at least one other person.');
    for (const m of members) if (m !== userId) await this.assertMember(workspaceId, m);

    const convo = await this.conversations.create({
      workspaceId: new Types.ObjectId(workspaceId),
      type: 'group',
      name: name.trim().slice(0, 80) || 'Group',
      memberUserIds: members.map((id) => new Types.ObjectId(id)),
      createdByUserId: new Types.ObjectId(userId),
      directKey: null,
    });
    this.notifyConversationChanged(convo, members.filter((m) => m !== userId));
    return convo;
  }

  async renameGroup(workspaceId: string, conversationId: string, userId: string, name: string): Promise<ConversationDocument> {
    const convo = await this.getOrThrow(workspaceId, conversationId, userId);
    if (convo.type !== 'group') throw ApiException.validation('Only groups can be renamed.');
    convo.name = name.trim().slice(0, 80) || convo.name;
    await convo.save();
    this.realtime.emitToConversation(convo.id, 'chat.conversation_updated', { conversation: this.conversationView(convo, 0) }, userId);
    return convo;
  }

  async addMembers(workspaceId: string, conversationId: string, userId: string, newMemberIds: string[]): Promise<ConversationDocument> {
    const convo = await this.getOrThrow(workspaceId, conversationId, userId);
    if (convo.type !== 'group') throw ApiException.validation('Cannot add people to a direct message.');
    const current = new Set(convo.memberUserIds.map((id) => id.toString()));
    const added: string[] = [];
    for (const m of newMemberIds) {
      if (current.has(m)) continue;
      await this.assertMember(workspaceId, m);
      convo.memberUserIds.push(new Types.ObjectId(m));
      added.push(m);
    }
    if (added.length === 0) return convo;
    await convo.save();
    this.notifyConversationChanged(convo, added);
    this.realtime.emitToConversation(convo.id, 'chat.conversation_updated', { conversation: this.conversationView(convo, 0) }, userId);
    return convo;
  }

  async removeMember(workspaceId: string, conversationId: string, userId: string, targetUserId: string): Promise<void> {
    const convo = await this.getOrThrow(workspaceId, conversationId, userId);
    if (convo.type !== 'group') throw ApiException.validation('Direct messages have no members to remove.');
    if (targetUserId !== userId && convo.createdByUserId.toString() !== userId) {
      throw ApiException.forbidden('Only the group creator can remove other people.');
    }
    convo.memberUserIds = convo.memberUserIds.filter((id) => id.toString() !== targetUserId);
    if (convo.memberUserIds.length === 0) {
      await this.conversations.deleteOne({ _id: convo._id });
      await this.messages.deleteMany({ conversationId: convo._id });
      return;
    }
    await convo.save();
    this.realtime.emitToUser(targetUserId, 'chat.conversation_updated', { removedFrom: convo.id }, userId);
    this.realtime.emitToConversation(convo.id, 'chat.conversation_updated', { conversation: this.conversationView(convo, 0) }, userId);
  }

  // ── messages ────────────────────────────────────────────────────────────

  async listMessages(
    workspaceId: string,
    conversationId: string,
    userId: string,
    page: { cursor?: string; limit?: number },
  ): Promise<CursorPage<ChatMessageView>> {
    await this.getOrThrow(workspaceId, conversationId, userId);
    const limit = Math.min(page.limit ?? 30, 100);
    const filter: Record<string, unknown> = {
      conversationId: new Types.ObjectId(conversationId),
      deletedAt: null,
      deletedForUserIds: { $ne: new Types.ObjectId(userId) },
    };
    Object.assign(filter, cursor.idFilter(cursor.decode(page.cursor), 'desc'));
    const rows = await this.messages.find(filter).sort({ _id: -1 }).limit(limit + 1).exec();
    const pageResult = cursorPage(rows.map((r) => this.messageView(r)), limit);
    // return ascending for display
    pageResult.items.reverse();
    return pageResult;
  }

  async send(
    workspaceId: string,
    conversationId: string,
    userId: string,
    body: string,
    mentionUserIds: string[] = [],
    attachment: CloudinaryAsset | null = null,
  ): Promise<ChatMessageView> {
    const convo = await this.getOrThrow(workspaceId, conversationId, userId);
    const text = body.trim();
    if (!text && !attachment) throw ApiException.validation('Message cannot be empty.');

    const message = await this.messages.create({
      workspaceId: new Types.ObjectId(workspaceId),
      conversationId: convo._id,
      senderUserId: new Types.ObjectId(userId),
      body: text.slice(0, 4000),
      attachment,
      mentionUserIds: [...new Set(mentionUserIds)].map((id) => new Types.ObjectId(id)),
    });

    convo.lastMessageAt = message.createdAt;
    convo.lastMessagePreview = text ? preview(text) : '📷 Photo';
    convo.lastMessageSenderUserId = new Types.ObjectId(userId);
    await convo.save();

    await this.reads.updateOne(
      { conversationId: convo._id, userId: new Types.ObjectId(userId) },
      { $set: { lastReadMessageId: message._id, lastReadAt: message.createdAt } },
      { upsert: true },
    );

    const view = this.messageView(message);
    this.realtime.emitToConversation(convo.id, 'chat.message', { message: view }, userId);

    const others = convo.memberUserIds.map((id) => id.toString()).filter((id) => id !== userId);
    // Also fan out to each member's own channel: the conversation channel
    // alone only reaches a client actively viewing this exact conversation
    // right now (it joins/leaves that channel with the thread's mount
    // lifecycle) — without this, closing the chat panel, or just looking at
    // a different conversation, silently stops delivery entirely, so the
    // unread badge, browser notification, and live message never arrive.
    this.realtime.emitToUsers(others, 'chat.message', { message: view }, userId);
    await this.notifications.notify(others, {
      workspaceId,
      type: 'chat.message',
      title: convo.type === 'group' ? `New message in ${convo.name ?? 'a group'}` : 'New message',
      body: text ? preview(text) : '📷 Photo',
      actorUserId: userId,
      entityType: 'conversation',
      entityId: convo.id,
    });
    return view;
  }

  async edit(workspaceId: string, conversationId: string, messageId: string, userId: string, body: string): Promise<ChatMessageView> {
    await this.getOrThrow(workspaceId, conversationId, userId);
    const message = await this.messages.findOne({ _id: messageId, conversationId: new Types.ObjectId(conversationId), deletedAt: null }).exec();
    if (!message) throw ApiException.notFound('Message');
    if (message.senderUserId.toString() !== userId) throw ApiException.forbidden('You can only edit your own messages.');
    if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw ApiException.forbidden('This message can no longer be edited (15-minute window has passed).');
    }
    const text = body.trim();
    if (!text) throw ApiException.validation('Message cannot be empty.');
    message.body = text.slice(0, 4000);
    message.editedAt = new Date();
    await message.save();
    const view = this.messageView(message);
    this.realtime.emitToConversation(conversationId, 'chat.message_updated', { message: view }, userId);
    return view;
  }

  /**
   * `scope: 'me'` hides the message only for the requester (still visible to
   * everyone else); `scope: 'everyone'` is sender-only, within the same
   * 15-minute window as editing, and removes it for the whole conversation.
   */
  async remove(
    workspaceId: string,
    conversationId: string,
    messageId: string,
    userId: string,
    scope: 'me' | 'everyone',
  ): Promise<void> {
    await this.getOrThrow(workspaceId, conversationId, userId);
    const message = await this.messages.findOne({ _id: messageId, conversationId: new Types.ObjectId(conversationId), deletedAt: null }).exec();
    if (!message) throw ApiException.notFound('Message');

    if (scope === 'me') {
      await this.messages.updateOne({ _id: message._id }, { $addToSet: { deletedForUserIds: new Types.ObjectId(userId) } });
      return;
    }

    if (message.senderUserId.toString() !== userId) throw ApiException.forbidden('You can only delete your own messages for everyone.');
    if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw ApiException.forbidden('This message can no longer be deleted for everyone (15-minute window has passed).');
    }
    message.deletedAt = new Date();
    await message.save();
    this.realtime.emitToConversation(conversationId, 'chat.message_deleted', { messageId }, userId);
  }

  /** Toggling the same emoji again removes it; a user may have several different emoji on one message. */
  async toggleReaction(
    workspaceId: string,
    conversationId: string,
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<ChatMessageView> {
    const convo = await this.getOrThrow(workspaceId, conversationId, userId);
    const message = await this.messages.findOne({ _id: messageId, conversationId: new Types.ObjectId(conversationId), deletedAt: null }).exec();
    if (!message) throw ApiException.notFound('Message');

    const uid = new Types.ObjectId(userId);
    const entry = message.reactions.find((r) => r.emoji === emoji);
    if (entry?.userIds.some((id) => id.toString() === userId)) {
      entry.userIds = entry.userIds.filter((id) => id.toString() !== userId);
      if (entry.userIds.length === 0) message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
    } else if (entry) {
      entry.userIds.push(uid);
    } else {
      message.reactions.push({ emoji, userIds: [uid] });
    }
    await message.save();

    const view = this.messageView(message);
    this.realtime.emitToConversation(convo.id, 'chat.message_updated', { message: view }, userId);
    return view;
  }

  /** Case-insensitive text search across a conversation's (non-deleted, non-hidden-for-me) history. */
  async searchMessages(
    workspaceId: string,
    conversationId: string,
    userId: string,
    query: string,
    limit = 50,
  ): Promise<ChatMessageView[]> {
    await this.getOrThrow(workspaceId, conversationId, userId);
    const q = query.trim();
    if (!q) return [];
    const rows = await this.messages
      .find({
        conversationId: new Types.ObjectId(conversationId),
        deletedAt: null,
        deletedForUserIds: { $ne: new Types.ObjectId(userId) },
        body: { $regex: escapeRegExp(q), $options: 'i' },
      })
      .sort({ _id: -1 })
      .limit(Math.min(limit, 100))
      .exec();
    return rows.map((r) => this.messageView(r));
  }

  async forward(
    workspaceId: string,
    userId: string,
    sourceConversationId: string,
    messageId: string,
    targetConversationIds: string[],
  ): Promise<ChatMessageView[]> {
    await this.getOrThrow(workspaceId, sourceConversationId, userId);
    const source = await this.messages
      .findOne({ _id: messageId, conversationId: new Types.ObjectId(sourceConversationId), deletedAt: null })
      .exec();
    if (!source) throw ApiException.notFound('Message');

    const out: ChatMessageView[] = [];
    for (const targetId of new Set(targetConversationIds)) {
      const convo = await this.getOrThrow(workspaceId, targetId, userId);
      const message = await this.messages.create({
        workspaceId: new Types.ObjectId(workspaceId),
        conversationId: convo._id,
        senderUserId: new Types.ObjectId(userId),
        body: source.body,
        attachment: source.attachment,
        forwardedFromUserId: source.senderUserId,
      });
      convo.lastMessageAt = message.createdAt;
      convo.lastMessagePreview = source.body ? preview(source.body) : '📷 Photo';
      convo.lastMessageSenderUserId = new Types.ObjectId(userId);
      await convo.save();
      const view = this.messageView(message);
      out.push(view);
      this.realtime.emitToConversation(convo.id, 'chat.message', { message: view }, userId);
      const others = convo.memberUserIds.map((id) => id.toString()).filter((id) => id !== userId);
      this.realtime.emitToUsers(others, 'chat.message', { message: view }, userId);
      await this.notifications.notify(others, {
        workspaceId,
        type: 'chat.message',
        title: convo.type === 'group' ? `New message in ${convo.name ?? 'a group'}` : 'New message',
        body: source.body ? preview(source.body) : '📷 Photo',
        actorUserId: userId,
        entityType: 'conversation',
        entityId: convo.id,
      });
    }
    return out;
  }

  async markRead(workspaceId: string, conversationId: string, userId: string, messageId: string | null): Promise<void> {
    await this.getOrThrow(workspaceId, conversationId, userId);
    const now = new Date();
    await this.reads.updateOne(
      { conversationId: new Types.ObjectId(conversationId), userId: new Types.ObjectId(userId) },
      { $set: { lastReadMessageId: messageId ? new Types.ObjectId(messageId) : null, lastReadAt: now } },
      { upsert: true },
    );
    this.realtime.emitToConversation(conversationId, 'chat.read', { userId, messageId, at: now.toISOString() }, userId);
  }

  /** Per-member read state for a conversation — lets the UI show ticks/"seen by". */
  async readReceipts(
    workspaceId: string,
    conversationId: string,
    userId: string,
  ): Promise<Array<{ userId: string; lastReadMessageId: string | null; lastReadAt: string }>> {
    await this.getOrThrow(workspaceId, conversationId, userId);
    const rows = await this.reads.find({ conversationId: new Types.ObjectId(conversationId) }).exec();
    return rows.map((r) => ({
      userId: r.userId.toString(),
      lastReadMessageId: r.lastReadMessageId?.toString() ?? null,
      lastReadAt: r.lastReadAt.toISOString(),
    }));
  }

  // ── internals ───────────────────────────────────────────────────────────

  private async assertMember(workspaceId: string, userId: string): Promise<void> {
    const ctx = await this.memberships.resolveContext(workspaceId, userId);
    if (!ctx || ctx.isClient) throw ApiException.validation('That person is not a member of this workspace.');
  }

  private notifyConversationChanged(convo: ConversationDocument, affectedUserIds: string[]): void {
    // their existing realtime token doesn't include the new channel — tell them to re-auth
    for (const uid of affectedUserIds) {
      this.realtime.emitToUser(uid, 'chat.conversation_updated', { conversationId: convo.id, joined: true }, convo.createdByUserId.toString());
    }
  }

  conversationView(c: ConversationDocument, unreadCount: number): ConversationView {
    return {
      id: c.id,
      type: c.type,
      name: c.name,
      memberUserIds: c.memberUserIds.map((id) => id.toString()),
      createdByUserId: c.createdByUserId.toString(),
      lastMessageAt: c.lastMessageAt.toISOString(),
      lastMessagePreview: c.lastMessagePreview,
      lastMessageSenderUserId: c.lastMessageSenderUserId?.toString() ?? null,
      unreadCount,
    };
  }

  messageView(m: ChatMessageDocument): ChatMessageView {
    return {
      id: m.id,
      conversationId: m.conversationId.toString(),
      senderUserId: m.senderUserId.toString(),
      body: m.body,
      attachment: m.attachment ?? null,
      mentionUserIds: m.mentionUserIds.map((id) => id.toString()),
      edited: m.editedAt !== null,
      forwardedFromUserId: m.forwardedFromUserId?.toString() ?? null,
      reactions: m.reactions.map((r) => ({ emoji: r.emoji, userIds: r.userIds.map((id) => id.toString()) })),
      createdAt: m.createdAt.toISOString(),
    };
  }
}
