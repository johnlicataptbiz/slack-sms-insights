import type { Logger } from '@slack/bolt';
import { getPrismaClient } from './prisma.js';

export type UserSendPreferencesRow = {
  user_id: string;
  default_line_id: number | null;
  default_from_number: string | null;
  created_at: Date;
  updated_at: Date;
};

const getPrisma = () => getPrismaClient();

export const getUserSendPreferences = async (
  userId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<UserSendPreferencesRow | null> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.user_send_preferences.findUnique({
      where: { user_id: userId },
    });

    return result as unknown as UserSendPreferencesRow | null;
  } catch (err) {
    logger?.error('getUserSendPreferences failed', err);
    throw err;
  }
};

export const upsertUserSendPreferences = async (
  params: {
    userId: string;
    defaultLineId?: number | null;
    defaultFromNumber?: string | null;
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<UserSendPreferencesRow> => {
  const prisma = getPrisma();

  try {
    const result = await prisma.user_send_preferences.upsert({
      where: { user_id: params.userId },
      create: {
        user_id: params.userId,
        default_line_id: params.defaultLineId ?? null,
        default_from_number: params.defaultFromNumber ?? null,
      },
      update: {
        default_line_id: params.defaultLineId ?? null,
        default_from_number: params.defaultFromNumber ?? null,
        updated_at: new Date(),
      },
    });

    return result as unknown as UserSendPreferencesRow;
  } catch (err) {
    logger?.error('upsertUserSendPreferences failed', err);
    throw err;
  }
};
