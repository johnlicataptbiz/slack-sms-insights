import { SentimentCategory, IntentCategory } from './sentiment-classifier';
import { getPrisma } from '../services/prisma';

// Visualization interfaces
export interface ClassificationVisualizationData {
  sentiment_distribution: Record<SentimentCategory, number>;
  intent_distribution: Record<IntentCategory, number>;
  time_series_trends: Array<{
    timestamp: Date;
    sentiment_avg: number;
    intent_breakdown: Record<IntentCategory, number>;
  }>;
  language_insights: {
    languages: string[];
    sentiment_by_language: Record<string, Record<SentimentCategory, number>>;
  };
}

export class ClassificationVisualizer {
  // Fetch classification data for visualization
  async fetchClassificationData(
    options: {
      start_date?: Date;
      end_date?: Date;
      time_granularity?: 'hour' | 'day' | 'week';
      language_filter?: string[];
    } = {}
  ): Promise<ClassificationVisualizationData> {
    const prisma = getPrisma();
    const {
      start_date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default 30 days back
      end_date = new Date(),
      time_granularity = 'day',
      language_filter = []
    } = options;

    try {
      // Fetch sentiment and intent distribution
      const sentimentDistribution = await this.calculateSentimentDistribution(
        start_date, 
        end_date, 
        language_filter
      );

      const intentDistribution = await this.calculateIntentDistribution(
        start_date, 
        end_date, 
        language_filter
      );

      // Fetch time series trends
      const timeSeriesTrends = await this.calculateTimeSeriesTrends(
        start_date, 
        end_date, 
        time_granularity
      );

      // Fetch language-specific insights
      const languageInsights = await this.calculateLanguageInsights(
        start_date, 
        end_date
      );

      return {
        sentiment_distribution: sentimentDistribution,
        intent_distribution: intentDistribution,
        time_series_trends: timeSeriesTrends,
        language_insights: languageInsights
      };
    } catch (error) {
      console.error('Failed to fetch classification data:', error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }

  // Calculate sentiment distribution
  private async calculateSentimentDistribution(
    start_date: Date, 
    end_date: Date, 
    language_filter: string[]
  ): Promise<Record<SentimentCategory, number>> {
    const prisma = getPrisma();

    const baseQuery = {
      where: {
        event_ts: {
          gte: start_date,
          lte: end_date
        },
        ...(language_filter.length > 0 ? { 
          language: { in: language_filter } 
        } : {})
      }
    };

    const distribution = await prisma.smsEvent.groupBy({
      by: ['sentiment_score'],
      _count: { id: true },
      ...baseQuery
    });

    // Map sentiment scores to categories
    const sentimentDistribution: Record<SentimentCategory, number> = Object.values(SentimentCategory)
      .filter(category => typeof category === 'number')
      .reduce((acc, category) => {
        acc[category] = 0;
        return acc;
      }, {} as Record<SentimentCategory, number>);

    distribution.forEach(item => {
      const category = this.mapSentimentScoreToCategory(item.sentiment_score);
      sentimentDistribution[category] += item._count.id;
    });

    return sentimentDistribution;
  }

  // Calculate intent distribution
  private async calculateIntentDistribution(
    start_date: Date, 
    end_date: Date, 
    language_filter: string[]
  ): Promise<Record<IntentCategory, number>> {
    const prisma = getPrisma();

    const baseQuery = {
      where: {
        event_ts: {
          gte: start_date,
          lte: end_date
        },
        ...(language_filter.length > 0 ? { 
          language: { in: language_filter } 
        } : {})
      }
    };

    const distribution = await prisma.smsEvent.groupBy({
      by: ['ai_classification'],
      _count: { id: true },
      ...baseQuery
    });

    // Map AI classifications to intent categories
    const intentDistribution: Record<IntentCategory, number> = Object.values(IntentCategory)
      .filter(category => typeof category === 'number')
      .reduce((acc, category) => {
        acc[category] = 0;
        return acc;
      }, {} as Record<IntentCategory, number>);

    distribution.forEach(item => {
      const category = this.mapClassificationToIntent(item.ai_classification);
      intentDistribution[category] += item._count.id;
    });

    return intentDistribution;
  }

  // Calculate time series trends
  private async calculateTimeSeriesTrends(
    start_date: Date, 
    end_date: Date, 
    granularity: 'hour' | 'day' | 'week'
  ): Promise<Array<{
    timestamp: Date;
    sentiment_avg: number;
    intent_breakdown: Record<IntentCategory, number>;
  }>> {
    const prisma = getPrisma();

    // Implement time-based grouping based on granularity
    const groupingFunction = (date: Date) => {
      switch (granularity) {
        case 'hour':
          return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
        case 'day':
          return new Date(date.getFullYear(), date.getMonth(), date.getDate());
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          return weekStart;
      }
    };

    const trends = await prisma.smsEvent.findMany({
      where: {
        event_ts: {
          gte: start_date,
          lte: end_date
        }
      },
      select: {
        event_ts: true,
        sentiment_score: true,
        ai_classification: true
      }
    });

    // Group and calculate trends
    const trendMap = new Map<number, {
      timestamp: Date;
      sentiment_scores: number[];
      intent_breakdown: Record<IntentCategory, number>;
    }>();

    trends.forEach(event => {
      const groupTimestamp = groupingFunction(event.event_ts).getTime();
      
      if (!trendMap.has(groupTimestamp)) {
        trendMap.set(groupTimestamp, {
          timestamp: new Date(groupTimestamp),
          sentiment_scores: [],
          intent_breakdown: Object.values(IntentCategory)
            .filter(category => typeof category === 'number')
            .reduce((acc, category) => {
              acc[category] = 0;
              return acc;
            }, {} as Record<IntentCategory, number>)
        });
      }

      const trend = trendMap.get(groupTimestamp)!;
      
      // Aggregate sentiment scores
      if (event.sentiment_score !== null) {
        trend.sentiment_scores.push(event.sentiment_score);
      }

      // Aggregate intent breakdown
      const intentCategory = this.mapClassificationToIntent(event.ai_classification);
      trend.intent_breakdown[intentCategory]++;
    });

    // Transform to final output
    return Array.from(trendMap.values()).map(trend => ({
      timestamp: trend.timestamp,
      sentiment_avg: trend.sentiment_scores.length > 0 
        ? trend.sentiment_scores.reduce((a, b) => a + b, 0) / trend.sentiment_scores.length 
        : 0,
      intent_breakdown: trend.intent_breakdown
    }));
  }

  // Calculate language-specific insights
  private async calculateLanguageInsights(
    start_date: Date, 
    end_date: Date
  ): Promise<{
    languages: string[];
    sentiment_by_language: Record<string, Record<SentimentCategory, number>>;
  }> {
    const prisma = getPrisma();

    const languageData = await prisma.smsEvent.groupBy({
      by: ['language', 'sentiment_score'],
      _count: { id: true },
      where: {
        event_ts: {
          gte: start_date,
          lte: end_date
        }
      }
    });

    // Organize insights by language
    const sentimentByLanguage: Record<string, Record<SentimentCategory, number>> = {};
    const languages = new Set<string>();

    languageData.forEach(item => {
      const language = item.language || 'unknown';
      const category = this.mapSentimentScoreToCategory(item.sentiment_score);
      
      languages.add(language);

      if (!sentimentByLanguage[language]) {
        sentimentByLanguage[language] = Object.values(SentimentCategory)
          .filter(cat => typeof cat === 'number')
          .reduce((acc, cat) => {
            acc[cat] = 0;
            return acc;
          }, {} as Record<SentimentCategory, number>);
      }

      sentimentByLanguage[language][category] += item._count.id;
    });

    return {
      languages: Array.from(languages),
      sentiment_by_language: sentimentByLanguage
    };
  }

  // Utility methods for mapping
  private mapSentimentScoreToCategory(score: number | null): SentimentCategory {
    if (score === null) return SentimentCategory.NEUTRAL;
    
    if (score <= -0.75) return SentimentCategory.VERY_NEGATIVE;
    if (score < 0) return SentimentCategory.NEGATIVE;
    if (score === 0) return SentimentCategory.NEUTRAL;
    if (score > 0 && score <= 0.75) return SentimentCategory.POSITIVE;
    return SentimentCategory.VERY_POSITIVE;
  }

  private mapClassificationToIntent(classification: string | null): IntentCategory {
    switch (classification) {
      case 'booking_intent': return IntentCategory.BOOKING;
      case 'support_request': return IntentCategory.SUPPORT;
      case 'conversion_inquiry': return IntentCategory.SALES;
      case 'hard_opt_out':
      case 'soft_opt_out': return IntentCategory.OPT_OUT;
      default: return IntentCategory.GENERAL_INQUIRY;
    }
  }

  // Export visualization data to various formats
  async exportVisualizationData(
    data: ClassificationVisualizationData,
    format: 'json' | 'csv' | 'xlsx' = 'json'
  ): Promise<string> {
    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'csv':
        return this.convertToCSV(data);
      case 'xlsx':
        return this.convertToXLSX(data);
      default:
        throw new Error('Unsupported export format');
    }
  }

  // Convert to CSV (simplified)
  private convertToCSV(data: ClassificationVisualizationData): string {
    let csv = 'Category,Type,Value\n';

    // Sentiment distribution
    Object.entries(data.sentiment_distribution).forEach(([category, count]) => {
      csv += `Sentiment,${category},${count}\n`;
    });

    // Intent distribution
    Object.entries(data.intent_distribution).forEach(([category, count]) => {
      csv += `Intent,${category},${count}\n`;
    });

    // Time series trends
    data.time_series_trends.forEach(trend => {
      csv += `TimeSeries,${trend.timestamp.toISOString()},${trend.sentiment_avg}\n`;
    });

    return csv;
  }

  // Convert to XLSX (placeholder - would require additional library)
  private convertToXLSX(data: ClassificationVisualizationData): string {
    throw new Error('XLSX export not implemented in this version');
  }
}