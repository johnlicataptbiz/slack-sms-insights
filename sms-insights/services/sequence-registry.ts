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
    const existingAlias = await tx.sequence_aliases.findUnique({
      where: { raw_label: trimmed },
    });
    if (existingAlias) return existingAlias.sequence_id;

    let registry = await tx.sequence_registry.findUnique({
      where: { normalized_label: normalized },
    });

    if (!registry) {
      registry = await tx.sequence_registry.create({
        data: {
          label: trimmed,
          normalized_label: normalized,
        },
      });
    }

    await tx.sequence_aliases.upsert({
      where: { raw_label: trimmed },
      update: {
        normalized_label: normalized,
        sequence_id: registry.id,
      },
      create: {
        raw_label: trimmed,
        normalized_label: normalized,
        sequence_id: registry.id,
      },
    });

    return registry.id;
  });
};
