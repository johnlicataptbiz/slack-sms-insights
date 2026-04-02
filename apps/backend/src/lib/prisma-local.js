import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ log: ['warn', 'error'] });
export { PrismaClient };
export default prisma;
export const getPrismaClient = () => prisma;
