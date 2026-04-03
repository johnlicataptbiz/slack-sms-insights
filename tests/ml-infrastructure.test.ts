import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { ContinuousModelRetrainer } from '../sms-insights/ml/continuous-retraining'
import { PerformanceMonitor } from '../sms-insights/ml/performance-monitor'
import { BiasDetector } from '../sms-insights/ml/bias-detector'
import { MLModelStorage } from '../sms-insights/ml/model-storage'

describe('ML Infrastructure Test Suite', () => {
  let prisma: PrismaClient
  let modelRetrainer: ContinuousModelRetrainer
  let performanceMonitor: PerformanceMonitor
  let biasDetector: BiasDetector
  let modelStorage: MLModelStorage

  beforeAll(() => {
    prisma = new PrismaClient()
    modelRetrainer = new ContinuousModelRetrainer()
    performanceMonitor = new PerformanceMonitor()
    biasDetector = new BiasDetector()
    modelStorage = new MLModelStorage()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('Continuous Model Retraining', () => {
    it('should determine if retraining is necessary', async () => {
      const shouldRetrain = await modelRetrainer.shouldRetrain()
      expect(typeof shouldRetrain).toBe('boolean')
    })

    it('should prepare training data', async () => {
      const trainingData = await modelRetrainer.prepareTrainingData()
      expect(Array.isArray(trainingData)).toBe(true)
      expect(trainingData.length).toBeGreaterThan(0)
      
      trainingData.forEach(item => {
        expect(item).toHaveProperty('text')
        expect(item).toHaveProperty('label')
      })
    })
  })

  describe('Performance Monitoring', () => {
    it('should retrieve latest performance metrics', async () => {
      const metrics = await performanceMonitor.getLatestMetrics()
      
      expect(metrics).toHaveProperty('accuracy')
      expect(metrics).toHaveProperty('precision')
      expect(metrics).toHaveProperty('recall')
      expect(metrics).toHaveProperty('f1Score')
      
      expect(metrics.accuracy).toBeGreaterThanOrEqual(0)
      expect(metrics.accuracy).toBeLessThanOrEqual(1)
    })

    it('should evaluate model performance', async () => {
      // Mock model for testing
      const mockModel = {
        predict: async (text: string) => {
          // Simple mock prediction logic
          if (text.includes('good') || text.includes('great')) return 'positive'
          if (text.includes('bad') || text.includes('terrible')) return 'negative'
          return 'neutral'
        }
      }

      const evaluationMetrics = await performanceMonitor.evaluate(mockModel)
      
      expect(evaluationMetrics).toHaveProperty('accuracy')
      expect(evaluationMetrics).toHaveProperty('precision')
      expect(evaluationMetrics).toHaveProperty('recall')
      expect(evaluationMetrics).toHaveProperty('f1Score')
      expect(evaluationMetrics).toHaveProperty('confusionMatrix')
    })
  })

  describe('Bias Detection', () => {
    it('should detect bias in model predictions', async () => {
      const biasMetrics = await biasDetector.detectBiasDeviation()
      
      expect(Array.isArray(biasMetrics)).toBe(true)
      
      biasMetrics.forEach(metric => {
        expect(metric).toHaveProperty('attribute')
        expect(metric).toHaveProperty('deviation')
        expect(metric).toHaveProperty('details')
        
        expect(metric.deviation).toBeGreaterThanOrEqual(0)
        expect(metric.deviation).toBeLessThanOrEqual(1)
      })
    })

    it('should generate bias reduction strategies', async () => {
      const mockBiasMetrics = [
        {
          attribute: 'language',
          deviation: 0.2,
          details: {}
        }
      ]

      const strategies = await biasDetector.generateBiasReductionStrategy(mockBiasMetrics)
      
      expect(Array.isArray(strategies)).toBe(true)
      expect(strategies.length).toBeGreaterThan(0)
      
      strategies.forEach(strategy => {
        expect(typeof strategy).toBe('string')
        expect(strategy.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Model Storage', () => {
    it('should save and load models', async () => {
      const mockModel = {
        version: 'test-v1',
        weights: [1, 2, 3],
        config: { layers: 3 }
      }

      const modelId = await modelStorage.saveModel(mockModel, {
        version: 'test-v1',
        timestamp: new Date(),
        trainingDataSize: 1000,
        metrics: {
          accuracy: 0.85,
          precision: 0.82,
          recall: 0.88,
          f1Score: 0.85
        }
      })

      expect(typeof modelId).toBe('string')

      const loadedModel = await modelStorage.loadModel(modelId)
      expect(loadedModel).toEqual(mockModel)
    })

    it('should list models with filtering', async () => {
      const models = await modelStorage.listModels({
        limit: 5,
        minAccuracy: 0.8
      })

      expect(Array.isArray(models)).toBe(true)
      expect(models.length).toBeLessThanOrEqual(5)
      
      models.forEach(model => {
        expect(model.metrics.accuracy).toBeGreaterThanOrEqual(0.8)
      })
    })

    it('should clean up old models', async () => {
      await expect(modelStorage.cleanupOldModels({
        maxModels: 5,
        maxAge: 30
      })).resolves.not.toThrow()
    })
  })

  describe('Integration Tests', () => {
    it('should complete a full retraining cycle', async () => {
      // Simulate a complete model retraining process
      const initialMetrics = await performanceMonitor.getLatestMetrics()
      
      await modelRetrainer.retrain()
      
      const updatedMetrics = await performanceMonitor.getLatestMetrics()
      
      // Verify that metrics have been updated
      expect(updatedMetrics.timestamp).not.toEqual(initialMetrics.timestamp)
    })
  })
})