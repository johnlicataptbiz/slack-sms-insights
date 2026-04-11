import { ConversationStatus, type PrismaClient } from "@prisma/client";
import { BaseRepository } from "./base.repository.js";

export interface CreateConversationData {
  contact_key: string;
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
  next_followup_due_at?: Date;
}

export class ConversationRepository extends BaseRepository {
  // biome-ignore lint/complexity/noUselessConstructor: explicit constructor preserves base contract for direct instantiation.
  constructor(prisma: PrismaClient) {
    super(prisma);
  }

  async findById(id: string): Promise<unknown | null> {
    return this.prisma.conversations.findUnique({
      where: { id },
    });
  }

  async findByContactKey(contactKey: string): Promise<unknown | null> {
    return this.prisma.conversations.findUnique({
      where: { contact_key: contactKey },
    });
  }

  async create(data: CreateConversationData): Promise<unknown> {
    return this.prisma.conversations.create({
      data,
    });
  }

  async update(
    id: string,
    data: UpdateConversationData,
  ): Promise<unknown | null> {
    try {
      return await this.prisma.conversations.update({
        where: { id },
        data,
      });
    } catch (error) {
      // Handle not found case
      if (
        error instanceof Error &&
        error.message.includes("Record to update not found")
      ) {
        return null;
      }
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.conversations.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Record to delete does not exist")
      ) {
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
      orderBy?: "createdAt" | "updatedAt" | "last_touch_at";
      orderDirection?: "asc" | "desc";
    } = {},
  ): Promise<unknown[]> {
    const {
      status,
      current_rep_id,
      limit = 50,
      offset = 0,
      orderBy = "updatedAt",
      orderDirection = "desc",
    } = options;

    return this.prisma.conversations.findMany({
      where: {
        ...(status && { status }),
        ...(current_rep_id && { current_rep_id }),
      },
      orderBy: {
        [orderBy]: orderDirection,
      },
      take: limit,
      skip: offset,
    });
  }

  async count(
    options: { status?: ConversationStatus; current_rep_id?: string } = {},
  ): Promise<number> {
    const { status, current_rep_id } = options;

    return this.prisma.conversations.count({
      where: {
        ...(status && { status }),
        ...(current_rep_id && { current_rep_id }),
      },
    });
  }

  async findDueForFollowup(): Promise<unknown[]> {
    const now = new Date();

    return this.prisma.conversations.findMany({
      where: {
        next_followup_due_at: {
          lte: now,
        },
        status: ConversationStatus.open,
      },
      orderBy: {
        next_followup_due_at: "asc",
      },
    });
  }
}
