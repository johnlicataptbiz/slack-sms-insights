import { PrismaClient } from "@prisma/client";

// Prisma client configuration with optimizations
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
    // Prisma 7: Must specify accelerateUrl for client engine or use adapter
    ...(process.env.PRISMA_ACCELERATE_URL && {
      accelerateUrl: process.env.PRISMA_ACCELERATE_URL,
    }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Connection management with retry logic
export const connectPrisma = async (retries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.$connect();
      console.log("✅ Database connected successfully");
      return;
    } catch (error) {
      console.error(`❌ Database connection failed (attempt ${attempt}/${retries}):`, error);
      if (attempt === retries) {
        throw new Error(`Database connection failed after ${retries} attempts: ${error}`);
      }
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
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

// Health check with detailed diagnostics
export const healthCheck = async () => {
  try {
    // Test basic connectivity
    await prisma.$queryRaw`SELECT 1 as health_check`;

    // Test schema access
    const schemaTest = await prisma.$queryRaw`
      SELECT COUNT(*) as table_count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;

    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      details: {
        tables: schemaTest[0].table_count,
        connection: "active"
      }
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
      details: {
        connection: "failed",
        suggestion: "Check DATABASE_URL and network connectivity"
      }
    };
  }
};

export default prisma;
