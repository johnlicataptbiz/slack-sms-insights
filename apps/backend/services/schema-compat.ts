import type { PrismaClient } from '@prisma/client';

const MISSING_SCHEMA_PATTERNS = [
  'code: `42p01`',
  'code: `42703`',
  'relation "',
  'does not exist',
  'the table `',
  'the column `(not available)` does not exist',
];

export const isMissingSchemaError = (error: unknown): boolean => {
  const text = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return MISSING_SCHEMA_PATTERNS.some((pattern) => text.includes(pattern));
};

export const hasTableColumn = async (
  prisma: PrismaClient,
  tableName: string,
  columnName: string,
): Promise<boolean> => {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    ) AS exists
    `,
    tableName,
    columnName,
  );
  return Boolean(rows[0]?.exists);
};
