// Re-export from unified prisma module for backward compatibility
export {
  getPrismaClient,
  getPrisma,
  connectPrisma,
  getPrismaRuntimeStatus,
  default,
} from "../src/lib/prisma.js";
export type { PrismaStatus } from "../src/lib/prisma.js";
