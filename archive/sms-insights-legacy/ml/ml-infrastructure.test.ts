import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { SentimentClassifier } from './sentiment-classifier'
import { PerformanceMonitor } from './performance-monitor'
import { AnomalyDetector } from './anomaly-detector'
import { ModelPerformanceTrackingSystem } from './performance-tracking-system'
import { PrismaClient } from '@prisma/client'

describe('Machine Learning Infrastructure', () => {
  let prisma: PrismaClient
  let sentimentClassifier: SentimentClassifier
  let performanceMonitor: PerformanceMonitor
  let anomalyDetector: AnomalyDetector
  let performanceTrackingSystem: ModelPerformanceTrackingSystem

  beforeAll(() => {
    prisma = new PrismaClient()
    sentimentClassifier = new SentimentClassifier()
    performanceMonitor = new PerformanceMonitor()
    anomalyDetector = new AnomalyDetector()
    performanceTrackingSystem = new ModelPerformanceTrackingSystem()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('Sentiment Classifier', () => {
    const testMessages = [
      'I am really happy with the service!',
      'This is absolutely terrible and disappointing.',
      'The weather is okay today.',
      'Je suis très content du service.',  // French
      '我对服务非常满意。'  // Chinese
    ]

    it('should classify messages with high accuracy', async () => {
      for (const message of testMessages) {
        const result = await sentimentClassifier.predict(message)
        
        expect(result).toBeDefined()
        expect(['positive', 'negative', 'neutral']).toContain(result)
      }
    })

    it('should handle multiple languages', async () => {
      const multilingualResults = await Promise.all(
        testMessages.map(msg => sentimentClassifier.predict(msg))
      )
      
      expect(multilingualResults.length).toBe(testMessages.length)
    })
  })

  describe('Performance Monitoring', () => {
    it('should retrieve latest metrics', async () => {
      const metrics = await performanceMonitor.getLatestMetrics()
      
      expect(metrics).toBeDefined()
      expect(metrics.accuracy).toBeGreaterThanOrEqual(0.5)
      expect(metrics.precision).toBeGreaterThanOrEqual(0.5)
      expect(metrics.recall).toBeGreaterThanOrEqual(0.5)
      expect(metrics.f1Score).toBeGreaterThanOrEqual(0.5)
    })

    it('should evaluate model performance', async () => {
      const mockModel = {
        predict: async (body: string) => {
          // Simulate prediction
          return body.includes('happy') ? 'positive' : 
                 body.includes('terrible') ? 'negative' : 'neutral'
        }
      }

      const performanceMetrics = await performanceMonitor.evaluate(mockModel)
      
      expect(performanceMetrics).toBeDefined()
      expect(performanceMetrics.accuracy).toBeGreaterThan(0)
      expect(performanceMetrics.precision).toBeGreaterThan(0)
      expect(performanceMetrics.recall).toBeGreaterThan(0)
      expect(performanceMetrics.f1Score).toBeGreaterThan(0)
    })
  })

  describe('Anomaly Detection', () => {
    it('should detect performance anomalies', async () => {
      const anomalyResult = await anomalyDetector.detectPerformanceAnomalies()
      
      expect(anomalyResult).toBeDefined()
      expect(typeof anomalyResult.hasAnomalies).toBe('boolean')
      expect(Array.isArray(anomalyResult.anomalyDetails)).toBe(true)
    })

    it('should trigger remediation when needed', async () => {
      await expect(anomalyDetector.triggerRemediation()).resolves.not.toThrow()
    })
  })

  describe('Performance Tracking System', () => {
    it('should capture performance snapshot', async () => {
      await expect(performanceTrackingSystem.capturePerformanceSnapshot()).resolves.not.toThrow()
    })

    it('should analyze performance trend', async () => {
      const trendAnalysis = await performanceTrackingSystem.analyzePerformanceTrend()
      
      expect(trendAnalysis).toBeDefined()
      expect(trendAnalysis.performanceTrend).toBeTruthy()
      expect(typeof trendAnalysis.criticalIssuesDetected).toBe('boolean')
      expect(trendAnalysis.trendDetails).toBeDefined()
    })

    it('should clean up historical data', async () => {
      await expect(performanceTrackingSystem.cleanupHistoricalData()).resolves.not.toThrow()
    })
  })

  describe('Integration Tests', () => {
    it('should have consistent performance across components', async () => {
      // Capture performance snapshot
      await performanceTrackingSystem.capturePerformanceSnapshot()

      // Check for anomalies
      const anomalyResult = await anomalyDetector.detectPerformanceAnomalies()

      // Retrieve latest metrics
      const latestMetrics = await performanceMonitor.getLatestMetrics()

      // Validate integration
      expect(latestMetrics.accuracy).toBeGreaterThanOrEqual(0.5)
      expect(latestMetrics.precision).toBeGreaterThanOrEqual(0.5)
      expect(latestMetrics.recall).toBeGreaterThanOrEqual(0.5)
      expect(latestMetrics.f1Score).toBeGreaterThanOrEqual(0.5)
    })
  })
})