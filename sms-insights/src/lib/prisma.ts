import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withAccelerate } from "@prisma/extension-accelerate";

// Prisma client configuration with optimizations
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const createPrisma = (): PrismaClient => {
  const accelerateUrl = process.env.DATABASE_ACCELERATE_URL || process.env.PRISMA_ACCELERATE_URL;
  if (accelerateUrl) {
    const clientOptions = { accelerateUrl } as unknown as ConstructorParameters<typeof PrismaClient>[0];
    return (new PrismaClient(clientOptions) as PrismaClient).$extends(withAccelerate()) as unknown as PrismaClient;
  }
  const connectionString = process.env.DATABASE_URL || '';
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter } as unknown as ConstructorParameters<typeof PrismaClient>[0]);
};

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Connection management
export const connectPrisma = async () => {
  try {
    await prisma.$connect();
    console.log("✅ Database connected successfully");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    throw error;
  }
};

export const disconnectPrisma = async () => {
  try {
    await prisma.$disconnect();
    console.log("✅ Database disconnected successfully");
  } catch (error) {
    console.error("❌ Database disconnection failed:", error);
    throw error;
  }
};

// Health check
export const healthCheck = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "healthy", timestamp: new Date().toISOString() };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    };
  }
};

export default prisma;
