import prismaLocal from './prisma-local.js';

export * from './prisma-local.js';

export default prismaLocal;

export const connectPrisma = async () => {
  await prismaLocal.$connect();
  return prismaLocal;
};

export const getPrismaClient = () => prismaLocal;
