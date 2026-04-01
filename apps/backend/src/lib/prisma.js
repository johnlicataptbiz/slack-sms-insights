import prismaLocal from './prisma-local.js';
export * from './prisma-local.js';
export default prismaLocal;
export const connectPrisma = async () => {
  console.log('Prisma client ready');
  return prismaLocal;
};
export const getPrismaClient = () => prismaLocal;
