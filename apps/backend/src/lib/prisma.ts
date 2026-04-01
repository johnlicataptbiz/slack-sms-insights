import prismaLocal from './prisma-local.js';

export * from './prisma-local.js';
export const getPrismaClient = () => prismaLocal;

export const connectPrisma = async () => {
  await prismaLocal.$connect();
};

export default prismaLocal;
