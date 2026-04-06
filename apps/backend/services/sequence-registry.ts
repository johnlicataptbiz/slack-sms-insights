import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from './prisma.js';

const getPrisma = () => getPrismaClient();

export const normalizeSequenceLabel = (label: string): string => {
  const trimmed = label.trim();
  if (!trimmed) return '';
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const resolveSequenceId = async (
  rawLabel: string | null | undefined,
  prisma: PrismaClient = getPrisma(),
): Promise<string | null> => {
  const trimmed = (rawLabel ?? '').trim();
  if (!trimmed) return null;

  const normalized = normalizeSequenceLabel(trimmed);
  if (!normalized) return null;

  try {
    return await prisma.$transaction(async (tx) => {
      // sequenceAliases may not exist in all environments
      let existingAlias = null;
      try {
        existingAlias = await (tx as any).sequenceAliases?.findUnique({
          where: { rawLabel: trimmed },
        });
      } catch {
        // Table doesn't exist, skip alias lookup
      }
      if (existingAlias) return existingAlias.sequenceId;

      let registry = await tx.sequenceRegistry.findFirst({
        where: { normalizedLabel: normalized },
      });

      if (!registry) {
        registry = await tx.sequenceRegistry.create({
          data: {
            label: trimmed,
            normalizedLabel: normalized,
          },
        });
      }

      // Try to upsert alias if table exists
      try {
        await (tx as any).sequenceAliases?.upsert({
          where: { rawLabel: trimmed },
          update: {
            normalizedLabel: normalized,
            sequenceId: registry.id,
          },
          create: {
            rawLabel: trimmed,
            normalizedLabel: normalized,
            sequenceId: registry.id,
          },
        });
      } catch {
        // Table doesn't exist, skip
      }

      return registry.id;
    });
  } catch {
    // sequenceRegistry table may not exist, return null to proceed without sequence
    return null;
  }
};
