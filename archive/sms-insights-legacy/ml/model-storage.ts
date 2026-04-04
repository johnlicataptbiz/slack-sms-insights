import { PrismaClient } from '@prisma/client'
import { logger } from '@/lib/logger'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'

export interface ModelMetadata {
  id?: string
  version: string
  timestamp: Date
  trainingDataSize: number
  metrics: {
    accuracy: number
    precision: number
    recall: number
    f1Score: number
  }
  hyperparameters?: Record<string, any>
  tags?: string[]
}

export class MLModelStorage {
  private prisma: PrismaClient
  private modelStoragePath: string

  constructor(storagePath?: string) {
    this.prisma = new PrismaClient()
    this.modelStoragePath = storagePath || path.join(process.cwd(), 'ml-models')
  }

  async saveModel(
    model: any, 
    metadata: Partial<ModelMetadata> = {}
  ): Promise<string> {
    try {
      // Ensure storage directory exists
      await fs.mkdir(this.modelStoragePath, { recursive: true })

      // Generate unique model identifier
      const modelVersion = metadata.version || 
        `v${new Date().toISOString().replace(/[:.]/g, '-')}`
      
      // Serialize model
      const serializedModel = JSON.stringify(model)
      
      // Generate hash for model content
      const modelHash = crypto
        .createHash('sha256')
        .update(serializedModel)
        .digest('hex')

      // Create full metadata
      const fullMetadata: ModelMetadata = {
        version: modelVersion,
        timestamp: new Date(),
        trainingDataSize: metadata.trainingDataSize || 0,
        metrics: metadata.metrics || {
          accuracy: 0,
          precision: 0,
          recall: 0,
          f1Score: 0
        },
        hyperparameters: metadata.hyperparameters || {},
        tags: metadata.tags || []
      }

      // Save model file
      const modelFilename = `${modelVersion}-${modelHash}.json`
      const modelFilePath = path.join(this.modelStoragePath, modelFilename)
      await fs.writeFile(modelFilePath, serializedModel)

      // Persist metadata in database
      const savedModel = await this.prisma.mlModel.create({
        data: {
          version: fullMetadata.version,
          filename: modelFilename,
          timestamp: fullMetadata.timestamp,
          trainingDataSize: fullMetadata.trainingDataSize,
          metrics: fullMetadata.metrics as any,
          hyperparameters: fullMetadata.hyperparameters as any,
          tags: fullMetadata.tags
        }
      })

      logger.info('Model saved successfully', { 
        version: modelVersion, 
        filename: modelFilename 
      })

      return savedModel.id
    } catch (error) {
      logger.error('Error saving ML model', { error })
      throw error
    }
  }

  async loadModel(modelId?: string): Promise<any> {
    try {
      // If no ID provided, fetch the latest model
      const modelRecord = modelId
        ? await this.prisma.mlModel.findUnique({ where: { id: modelId } })
        : await this.prisma.mlModel.findFirst({ 
            orderBy: { timestamp: 'desc' } 
          })

      if (!modelRecord) {
        throw new Error('No model found')
      }

      // Construct full file path
      const modelFilePath = path.join(
        this.modelStoragePath, 
        modelRecord.filename
      )

      // Read model file
      const modelContent = await fs.readFile(modelFilePath, 'utf-8')
      
      return JSON.parse(modelContent)
    } catch (error) {
      logger.error('Error loading ML model', { error, modelId })
      throw error
    }
  }

  async listModels(options: {
    limit?: number
    tags?: string[]
    minAccuracy?: number
  } = {}): Promise<ModelMetadata[]> {
    try {
      const { 
        limit = 10, 
        tags, 
        minAccuracy = 0 
      } = options

      const models = await this.prisma.mlModel.findMany({
        where: {
          ...(tags ? { tags: { hasSome: tags } } : {}),
          metrics: {
            path: ['accuracy'],
            gt: minAccuracy
          }
        },
        orderBy: { timestamp: 'desc' },
        take: limit
      })

      return models.map(model => ({
        id: model.id,
        version: model.version,
        timestamp: model.timestamp,
        trainingDataSize: model.trainingDataSize,
        metrics: model.metrics as any,
        hyperparameters: model.hyperparameters as any,
        tags: model.tags
      }))
    } catch (error) {
      logger.error('Error listing ML models', { error })
      throw error
    }
  }

  async getLatestModelTimestamp(): Promise<Date | null> {
    try {
      const latestModel = await this.prisma.mlModel.findFirst({
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true }
      })

      return latestModel?.timestamp || null
    } catch (error) {
      logger.error('Error retrieving latest model timestamp', { error })
      throw error
    }
  }

  async cleanupOldModels(options: {
    maxModels?: number
    maxAge?: number // in days
  } = {}): Promise<void> {
    try {
      const { 
        maxModels = 10, 
        maxAge = 90 // 3 months default
      } = options

      // Fetch models to delete
      const modelsToDelete = await this.prisma.mlModel.findMany({
        where: {
          OR: [
            // Delete if more than maxModels exist
            { id: { notIn: (await this.prisma.mlModel.findMany({
                orderBy: { timestamp: 'desc' },
                take: maxModels,
                select: { id: true }
              })).map(m => m.id) 
            },
            // Or delete if older than maxAge
            timestamp: { 
              lt: new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000) 
            }
          ]
        },
        select: { filename: true, id: true }
      })

      // Delete model files
      await Promise.all(modelsToDelete.map(async (model) => {
        try {
          // Delete file
          await fs.unlink(path.join(this.modelStoragePath, model.filename))
        } catch (fileError) {
          logger.warn('Could not delete model file', { 
            filename: model.filename, 
            error: fileError 
          })
        }
      }))

      // Delete database records
      await this.prisma.mlModel.deleteMany({
        where: { 
          id: { in: modelsToDelete.map(m => m.id) } 
        }
      })

      logger.info('Cleaned up old ML models', { 
        deletedModels: modelsToDelete.length 
      })
    } catch (error) {
      logger.error('Error cleaning up old ML models', { error })
      throw error
    }
  }
}