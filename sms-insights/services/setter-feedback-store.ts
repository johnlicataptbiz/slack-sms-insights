import { getPrismaClient } from './prisma.js';

const getPrisma = () => getPrismaClient();

export const hasRecentPersistentFeedback = async ({
  channelId,
  threadTs,
  dedupeMinutes,
}: {
  channelId: string;
  threadTs: string;
  dedupeMinutes: number;
}): Promise<boolean> => {
  const prisma = getPrisma();

  try {
    const feedback = await prisma.setter_feedback_dedupe.findUnique({
      where: {
        channel_id_thread_ts: {
          channel_id: channelId,
          thread_ts: threadTs,
        },
      },
      select: { created_at: true },
    });

    if (!feedback) return false;
    const createdAt = feedback.created_at.getTime();
    const ageMs = Date.now() - createdAt;
    return ageMs < dedupeMinutes * 60_000;
  } catch (err) {
    return false;
  }
};

export const insertPersistentFeedback = async ({
  channelId,
  threadTs,
  messageTs,
}: {
  channelId: string;
  threadTs: string;
  messageTs?: string;
}): Promise<void> => {
  const prisma = getPrisma();

  try {
    await prisma.setter_feedback_dedupe.upsert({
      where: {
        channel_id_thread_ts: {
          channel_id: channelId,
          thread_ts: threadTs,
        },
      },
      create: {
        channel_id: channelId,
        thread_ts: threadTs,
        message_ts: messageTs || null,
      },
      update: {
        message_ts: messageTs || null,
        created_at: new Date(),
      },
    });
  } catch (err) {
    // Ignore errors for dedupe tracking
  }
};
