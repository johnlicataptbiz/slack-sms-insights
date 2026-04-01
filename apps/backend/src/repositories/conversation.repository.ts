import type { Conversation, ConversationStatus } from '@prisma/client';
import { ConversationDetailSelectPattern } from '../schemas/db-results.js';
import { BaseRepository } from './base.repository.js';

export interface CreateConversationData {
  contactKey: string;
  contact_id?: string;
  contact_phone?: string;
  current_rep_id?: string;
  status?: ConversationStatus;
}

export interface UpdateConversationData {
  contact_id?: string;
  contact_phone?: string;
  current_rep_id?: string;
  status?: ConversationStatus;
  last_inbound_at?: Date;
  last_outbound_at?: Date;
  last_touch_at?: Date;
  unreplied_inbound_count?: number;
  nextFollowupAt?: Date;
}

export class ConversationRepository extends BaseRepository {
  async findById(id: string): Promise<Conversation | null> {
    return this.prisma.conversation.findUnique({
      where: { id },
      select: ConversationDetailSelectPattern,
    });
  }

  async findByContactKey(contactKey: string): Promise<Conversation | null> {
    return this.prisma.conversation.findUnique({
      where: { contactKey },
      select: ConversationDetailSelectPattern,
    });
  }

  async create(data: CreateConversationData): Promise<Conversation> {
    return this.prisma.conversation.create({
      data,
      select: ConversationDetailSelectPattern,
    });
  }

  async update(id: string, data: UpdateConversationData): Promise<Conversation | null> {
    try {
      return await this.prisma.conversation.update({
        where: { id },
        data,
        select: ConversationDetailSelectPattern,
      });
    } catch (error) {
      // Handle not found case
      if (error instanceof Error && error.message.includes('Record to update not found')) {
        return null;
      }
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.conversation.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
        return false;
      }
      throw error;
    }
  }

  async findMany(
    options: {
      status?: ConversationStatus;
      current_rep_id?: string;
      limit?: number;
      offset?: number;
      orderBy?: 'createdAt' | 'updatedAt' | 'last_touch_at';
      orderDirection?: 'asc' | 'desc';
    } = {},
  ): Promise<Conversation[]> {
    const { status, current_rep_id, limit = 50, offset = 0, orderBy = 'updatedAt', orderDirection = 'desc' } = options;

    return this.prisma.conversation.findMany({
      where: {
        ...(status && { status }),
        ...(current_rep_id && { current_rep_id }),
      },
      include: {
        conversation_notes: true,
        draft_suggestions: true,
        send_attempts: true,
      },
      orderBy: {
        [orderBy]: orderDirection,
      },
      take: limit,
      skip: offset,
    });
  }

  async count(options: { status?: ConversationStatus; current_rep_id?: string } = {}): Promise<number> {
    const { status, current_rep_id } = options;

    return this.prisma.conversation.count({
      where: {
        ...(status && { status }),
        ...(current_rep_id && { current_rep_id }),
      },
    });
  }

  async findDueForFollowup(): Promise<Conversation[]> {
    const now = new Date();

    return this.prisma.conversation.findMany({
      where: {
        nextFollowupAt: {
          lte: now,
        },
        status: 'open',
      },
      include: {
        conversation_notes: true,
        draft_suggestions: true,
      },
      orderBy: {
        nextFollowupAt: 'asc',
      },
    });
  }
}
