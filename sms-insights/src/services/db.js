import { databaseService } from './database-service.js';

export const initDatabase = async () => {
  try {
    await databaseService.initialize();
    console.log('✅ Database service initialized with resilience features');
  } catch (error) {
    console.error('❌ Database service initialization failed:', error);
    throw error;
  }
};