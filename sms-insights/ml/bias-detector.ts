import { PrismaClient } from '@prisma/client'
import { logger } from '@/lib/logger'

interface BiasMetric {
  attribute: string
  deviation: number
  details: {
    expectedDistribution: Record<string, number>
    actualDistribution: Record<string, number>
  }
}

export class BiasDetector {
  private prisma: PrismaClient

  constructor() {
    this.prisma = new PrismaClient()
  }

  async detectBiasDeviation(): Promise<BiasMetric[]> {
    try {
      // Define protected attributes to monitor
      const protectedAttributes = [
        'language',
        'sentiment_origin',
        'sender_type',
        'conversation_context'
      ]

      // Collect bias metrics for each attribute
      const biasMetrics: BiasMetric[] = await Promise.all(
        protectedAttributes.map(async (attribute) => {
          // Fetch distribution of sentiment labels for this attribute
          const distributionQuery = await this.prisma.smsEvent.groupBy({
            by: [attribute, 'aiSentimentLabel'],
            _count: {
              _all: true
            },
            where: {
              aiSentimentLabel: { not: null }
            }
          })

          // Normalize distribution
          const totalEvents = distributionQuery.reduce((sum, group) => sum + group._count._all, 0)
          
          // Compute actual and expected distributions
          const actualDistribution: Record<string, number> = {}
          const expectedDistribution: Record<string, number> = {}

          // Compute actual distribution
          distributionQuery.forEach(group => {
            const key = group[attribute] as string
            const sentimentLabel = group.aiSentimentLabel as string
            
            if (!actualDistribution[key]) {
              actualDistribution[key] = 0
            }
            actualDistribution[key] += group._count._all / totalEvents
          })

          // Compute expected distribution (ideally uniform)
          const uniqueValues = new Set(distributionQuery.map(group => group[attribute] as string))
          uniqueValues.forEach(value => {
            expectedDistribution[value] = 1 / uniqueValues.size
          })

          // Calculate deviation using Jensen-Shannon divergence
          const deviation = this.calculateJensenShannonDivergence(
            actualDistribution, 
            expectedDistribution
          )

          return {
            attribute,
            deviation,
            details: {
              expectedDistribution,
              actualDistribution
            }
          }
        })
      )

      // Persist bias detection results
      await this.persistBiasMetrics(biasMetrics)

      return biasMetrics
    } catch (error) {
      logger.error('Error detecting bias in SMS events', { error })
      throw error
    }
  }

  private calculateJensenShannonDivergence(
    P: Record<string, number>, 
    Q: Record<string, number>
  ): number {
    // Combine keys from both distributions
    const allKeys = new Set([...Object.keys(P), ...Object.keys(Q)])

    // Compute Jensen-Shannon Divergence
    let divergence = 0
    const M: Record<string, number> = {}

    // Compute midpoint distribution
    allKeys.forEach(key => {
      M[key] = 0.5 * ((P[key] || 0) + (Q[key] || 0))
    })

    // Compute KL divergence components
    allKeys.forEach(key => {
      const p = P[key] || 0
      const q = Q[key] || 0
      const m = M[key]

      // Avoid log(0)
      if (p > 0) {
        divergence += p * Math.log2(p / m)
      }
      if (q > 0) {
        divergence += q * Math.log2(q / m)
      }
    })

    // Normalize and take square root
    return Math.sqrt(divergence / 2)
  }

  private async persistBiasMetrics(metrics: BiasMetric[]): Promise<void> {
    try {
      await this.prisma.mlBiasDetection.create({
        data: {
          timestamp: new Date(),
          biasMetrics: metrics as any
        }
      })
    } catch (error) {
      logger.error('Error persisting bias detection metrics', { error })
    }
  }

  async generateBiasReductionStrategy(biasMetrics: BiasMetric[]): Promise<string[]> {
    const strategies: string[] = []

    biasMetrics.forEach(metric => {
      if (metric.deviation > 0.15) { // Threshold for significant bias
        switch (metric.attribute) {
          case 'language':
            strategies.push(
              `Improve multilingual training data for ${metric.attribute} with underrepresented languages`
            )
            break
          case 'sentiment_origin':
            strategies.push(
              `Adjust sampling strategy to balance sentiment representation across different origins`
            )
            break
          case 'sender_type':
            strategies.push(
              `Review and balance training data across different sender types`
            )
            break
          case 'conversation_context':
            strategies.push(
              `Enhance context-aware training to reduce contextual bias`
            )
            break
        }
      }
    })

    return strategies
  }
}