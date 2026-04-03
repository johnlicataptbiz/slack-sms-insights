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

  return await prisma.$transaction(async (tx) => {
    const existingAlias = await tx.sequenceAliases.findUnique({
      where: { rawLabel: trimmed },
    });
    if (existingAlias) return existingAlias.sequenceId;

    let registry = await tx.sequenceRegistry.findUnique({
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

    await tx.sequenceAliases.upsert({
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

    return registry.id;
  });
};
