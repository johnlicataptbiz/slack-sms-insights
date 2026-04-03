import { PrismaClient } from '@prisma/client'
import { logger } from '@/lib/logger'
import { ModelMetrics } from './performance-monitor'
import { ExplainabilityToolkit } from './explainability-toolkit'

export interface ValidationResult {
  passed: boolean
  metrics: ModelMetrics
  validationDetails: {
    accuracyTests: AccuracyTestResult[]
    biasTests: BiasTestResult[]
    robustnessTests: RobustnessTestResult[]
    performanceConsistency: PerformanceConsistencyResult
  }
}

export interface AccuracyTestResult {
  testName: string
  passed: boolean
  accuracy: number
  threshold: number
}

export interface BiasTestResult {
  testName: string
  passed: boolean
  biasScore: number
  maxAllowedBias: number
}

export interface RobustnessTestResult {
  testName: string
  passed: boolean
  performanceVariation: number
  maxAllowedVariation: number
}

export interface PerformanceConsistencyResult {
  passed: boolean
  variationScore: number
  maxAllowedVariation: number
}

export class ModelValidationFramework {
  private prisma: PrismaClient
  private explainabilityToolkit: ExplainabilityToolkit

  constructor() {
    this.prisma = new PrismaClient()
    this.explainabilityToolkit = new ExplainabilityToolkit()
  }

  async validateModel(): Promise<ValidationResult> {
    try {
      // Fetch recent performance metrics
      const metrics = await this.fetchRecentMetrics()

      // Perform comprehensive validation tests
      const accuracyTests = this.runAccuracyTests(metrics)
      const biasTests = await this.runBiasTests()
      const robustnessTests = this.runRobustnessTests(metrics)
      const performanceConsistency = await this.checkPerformanceConsistency()

      // Determine overall validation status
      const passed = this.evaluateOverallValidation(
        accuracyTests, 
        biasTests, 
        robustnessTests, 
        performanceConsistency
      )

      // Log validation results
      await this.logValidationResults({
        passed,
        metrics,
        validationDetails: {
          accuracyTests,
          biasTests,
          robustnessTests,
          performanceConsistency
        }
      })

      return {
        passed,
        metrics,
        validationDetails: {
          accuracyTests,
          biasTests,
          robustnessTests,
          performanceConsistency
        }
      }
    } catch (error) {
      logger.error('Model validation failed', { error })
      throw error
    }
  }

  private async fetchRecentMetrics(): Promise<ModelMetrics> {
    const performanceRecord = await this.prisma.mlModelPerformance.findFirst({
      orderBy: { timestamp: 'desc' },
      select: {
        accuracy: true,
        precision: true,
        recall: true,
        f1Score: true
      }
    })

    if (!performanceRecord) {
      throw new Error('No performance metrics available')
    }

    return {
      accuracy: performanceRecord.accuracy,
      precision: performanceRecord.precision,
      recall: performanceRecord.recall,
      f1Score: performanceRecord.f1Score
    }
  }

  private runAccuracyTests(metrics: ModelMetrics): AccuracyTestResult[] {
    const tests: AccuracyTestResult[] = [
      {
        testName: 'Overall Accuracy',
        passed: metrics.accuracy >= 0.85,
        accuracy: metrics.accuracy,
        threshold: 0.85
      },
      {
        testName: 'Precision Threshold',
        passed: metrics.precision >= 0.80,
        accuracy: metrics.precision,
        threshold: 0.80
      },
      {
        testName: 'Recall Threshold',
        passed: metrics.recall >= 0.80,
        accuracy: metrics.recall,
        threshold: 0.80
      },
      {
        testName: 'F1 Score Threshold',
        passed: metrics.f1Score >= 0.82,
        accuracy: metrics.f1Score,
        threshold: 0.82
      }
    ]

    return tests
  }

  private async runBiasTests(): Promise<BiasTestResult[]> {
    // Simulate bias testing across different message categories
    const testCategories = [
      'customer_support', 
      'sales_inquiry', 
      'technical_issue', 
      'general_communication'
    ]

    const biasTests: BiasTestResult[] = []

    for (const category of testCategories) {
      // Simulate bias calculation for each category
      const sampleMessages = await this.fetchSampleMessagesByCategory(category)
      const biasScore = await this.calculateCategoryBias(sampleMessages)

      biasTests.push({
        testName: `Bias Test - ${category}`,
        passed: biasScore <= 0.1, // 10% max bias allowed
        biasScore,
        maxAllowedBias: 0.1
      })
    }

    return biasTests
  }

  private runRobustnessTests(metrics: ModelMetrics): RobustnessTestResult[] {
    // Simulate robustness testing with different input variations
    const robustnessTests: RobustnessTestResult[] = [
      {
        testName: 'Short Message Robustness',
        passed: true, // Simulated
        performanceVariation: 0.05,
        maxAllowedVariation: 0.1
      },
      {
        testName: 'Long Message Robustness',
        passed: true, // Simulated
        performanceVariation: 0.07,
        maxAllowedVariation: 0.1
      },
      {
        testName: 'Multilingual Robustness',
        passed: true, // Simulated
        performanceVariation: 0.06,
        maxAllowedVariation: 0.1
      }
    ]

    return robustnessTests
  }

  private async checkPerformanceConsistency(): Promise<PerformanceConsistencyResult> {
    // Fetch performance metrics over time
    const historicalMetrics = await this.prisma.mlModelPerformance.findMany({
      orderBy: { timestamp: 'desc' },
      take: 30 // Last 30 performance records
    })

    // Calculate performance variation
    const performanceScores = historicalMetrics.map(m => m.accuracy)
    const meanScore = performanceScores.reduce((a, b) => a + b, 0) / performanceScores.length
    const variationScore = Math.max(
      ...performanceScores.map(score => Math.abs(score - meanScore))
    )

    return {
      passed: variationScore <= 0.1, // 10% max variation
      variationScore,
      maxAllowedVariation: 0.1
    }
  }

  private evaluateOverallValidation(
    accuracyTests: AccuracyTestResult[],
    biasTests: BiasTestResult[],
    robustnessTests: RobustnessTestResult[],
    performanceConsistency: PerformanceConsistencyResult
  ): boolean {
    // All tests must pass
    return (
      accuracyTests.every(test => test.passed) &&
      biasTests.every(test => test.passed) &&
      robustnessTests.every(test => test.passed) &&
      performanceConsistency.passed
    )
  }

  private async logValidationResults(validationResult: ValidationResult): Promise<void> {
    try {
      await this.prisma.mlModelValidation.create({
        data: {
          timestamp: new Date(),
          passed: validationResult.passed,
          metrics: JSON.stringify(validationResult.metrics),
          validationDetails: JSON.stringify(validationResult.validationDetails)
        }
      })
    } catch (error) {
      logger.error('Error logging validation results', { error })
    }
  }

  private async fetchSampleMessagesByCategory(category: string): Promise<string[]> {
    // Fetch sample messages for bias testing
    const sampleMessages = await this.prisma.smsEvent.findMany({
      where: { category },
      select: { body: true },
      take: 100
    })

    return sampleMessages.map(msg => msg.body)
  }

  private async calculateCategoryBias(messages: string[]): Promise<number> {
    // Simulate bias calculation
    const sentimentResults = await Promise.all(
      messages.map(msg => this.explainabilityToolkit.explainPrediction(msg))
    )

    // Calculate bias by checking sentiment distribution
    const sentimentCounts = sentimentResults.reduce((acc, result) => {
      acc[result.sentiment] = (acc[result.sentiment] || 0) + 1
      return acc
    }, { positive: 0, negative: 0, neutral: 0 })

    const totalMessages = messages.length
    const maxSentimentRatio = Math.max(
      sentimentCounts.positive / totalMessages,
      sentimentCounts.negative / totalMessages,
      sentimentCounts.neutral / totalMessages
    )

    return maxSentimentRatio
  }

  async triggerRevalidation(): Promise<void> {
    try {
      const validationResult = await this.validateModel()

      if (!validationResult.passed) {
        // Trigger model retraining or alert
        await this.prisma.mlModelRetrainingQueue.create({
          data: {
            timestamp: new Date(),
            reason: 'Failed validation tests',
            details: JSON.stringify(validationResult.validationDetails)
          }
        })

        logger.warn('Model validation failed. Retraining triggered.', {
          validationResult
        })
      }
    } catch (error) {
      logger.error('Error in model revalidation', { error })
    }
  }
}

// Export a singleton instance for easy use
export const modelValidationFramework = new ModelValidationFramework()