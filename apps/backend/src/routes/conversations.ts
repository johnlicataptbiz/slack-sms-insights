import { PrismaClient } from '@prisma/client';

// Global setup for tests
global.prisma = new PrismaClient();

// Extend global interface to include prisma
declare global {
  var prisma: PrismaClient;
}