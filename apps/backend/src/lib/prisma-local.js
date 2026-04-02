import { PrismaClient } from '@prisma/client';
const accelerateUrl = (process.env.PRISMA_ACCELERATE_URL || '').trim();
if (!accelerateUrl) {
  throw new Error('PRISMA_ACCELERATE_URL is required for Prisma client engine');
}

const prisma = new PrismaClient({
  accelerateUrl,
  log: ['warn', 'error'],
});
export { PrismaClient };
export default prisma;
export const getPrismaClient = () => prisma;
