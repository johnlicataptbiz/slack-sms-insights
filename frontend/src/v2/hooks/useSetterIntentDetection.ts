/**
 * useSetterIntentDetection - GPT-4 based intent detection
 * Replaces regex-based intent detection with LLM-powered analysis
 * Caches results for 5 minutes to minimize API calls
 */

import { useState, useCallback, useEffect } from "react";

export type Intent = "objection" | "coaching_interest" | "deal_update" | null;

export interface DetectionResult {
  intent: Intent;
  confidence: number; // 0-100
  reasoning: string;
  tags: string[];
}

interface CacheEntry {
  result: DetectionResult;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const intentCache = new Map<string, CacheEntry>();

export const useSetterIntentDetection = (
  latestMessage:
    | {
        text: string;
        id: string;
        timestamp: number;
      }
    | undefined,
  conversationContext?: {
    stage?: string;
    ownerLabel?: string;
    previousIntents?: Intent[];
  },
) => {
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Check cache validity
  const getCachedResult = useCallback(
    (messageId: string): DetectionResult | null => {
      const cached = intentCache.get(messageId);
      if (!cached) return null;

      const age = Date.now() - cached.timestamp;
      if (age > CACHE_TTL_MS) {
        intentCache.delete(messageId);
        return null;
      }

      return cached.result;
    },
    [],
  );

  // Detect intent using GPT-4
  const detectIntent = useCallback(async () => {
    if (!latestMessage?.text) {
      setResult(null);
      return;
    }

    // Check cache first
    const cached = getCachedResult(latestMessage.id);
    if (cached) {
      setResult(cached);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/v2/inbox/detect-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageText: latestMessage.text,
          conversationContext: {
            stage: conversationContext?.stage || "unknown",
            ownerLabel: conversationContext?.ownerLabel || "unassigned",
            previousIntents: conversationContext?.previousIntents || [],
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Inbox intent detection failed: ${response.statusText}`,
        );
      }

      const detectionResult: DetectionResult = await response.json();

      // Cache the result
      intentCache.set(latestMessage.id, {
        result: detectionResult,
        timestamp: Date.now(),
      });

      setResult(detectionResult);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[Intent Detection] Error:", error);
      setError(error);

      // Fallback: Return null intent (no detection, continue with manual qualification)
      setResult({
        intent: null,
        confidence: 0,
        reasoning:
          "Intent detection unavailable - manual qualification required",
        tags: [],
      });
    } finally {
      setIsLoading(false);
    }
  }, [latestMessage, conversationContext, getCachedResult]);

  // Effect: Detect intent when message changes
  useEffect(() => {
    detectIntent();
  }, [latestMessage?.id, conversationContext?.stage, detectIntent]);

  // Manual refetch (bypass cache)
  const refetch = useCallback(async () => {
    if (latestMessage?.id) {
      intentCache.delete(latestMessage.id);
    }
    await detectIntent();
  }, [latestMessage?.id, detectIntent]);

  return {
    result,
    isLoading,
    error,
    refetch,
    intent: result?.intent || null,
    confidence: result?.confidence || 0,
    tags: result?.tags || [],
  };
};

// Helper function for manual regex fallback if API fails catastrophically
export const detectIntentRegex = (
  text: string,
): { intent: Intent; confidence: number } => {
  const lower = text.toLowerCase();

  // Objection patterns
  if (/too expensive|can't afford|price|cost|premium/.test(lower)) {
    return { intent: "objection", confidence: 0.75 };
  }

  // Coaching interest patterns
  if (
    /interested|tell me more|how does|pricing|when|start|available|open/.test(
      lower,
    )
  ) {
    return { intent: "coaching_interest", confidence: 0.8 };
  }

  // Deal update patterns
  if (/update|progress|status|completed|finished|done|scheduled/.test(lower)) {
    return { intent: "deal_update", confidence: 0.85 };
  }

  return { intent: null, confidence: 0 };
};
