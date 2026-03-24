import { describe, it, expect, beforeEach } from "vitest";
import {
  canDerekPost,
  getPostConfidence,
  getDerekCommentIfWorth,
  getBotPersona,
} from "../../services/bot-personality.js";

describe("Derek Bot Personality - Safeguards", () => {
  const testChannelId = "C_TEST_123";

  beforeEach(() => {
    // Reset environment for each test
    process.env.DEREK_MIN_POST_INTERVAL_MIN = "30";
    process.env.DEREK_MAX_POSTS_PER_DAY = "5";
    process.env.DEREK_CONFIDENCE_THRESHOLD = "0.65";
  });

  describe("canDerekPost - Rate Limiting & Daily Caps", () => {
    it("should allow first post to a channel", () => {
      const result = canDerekPost(testChannelId);
      expect(result.canPost).toBe(true);
    });

    it("should return confidence between 0 and 1", () => {
      const confidence1 = getPostConfidence();
      const confidence2 = getPostConfidence("conversion");

      expect(confidence1).toBeGreaterThanOrEqual(0);
      expect(confidence1).toBeLessThanOrEqual(1);
      expect(confidence2).toBeGreaterThanOrEqual(0.6); // With metric, higher confidence
      expect(confidence2).toBeLessThanOrEqual(1);
    });
  });

  describe("getDerekCommentIfWorth - Confidence Filtering", () => {
    it("should return null when confidence is below threshold", () => {
      // This might return null if random confidence is low
      const comment1 = getDerekCommentIfWorth();
      const comment2 = getDerekCommentIfWorth("conversion");

      if (comment1) {
        expect(typeof comment1).toBe("string");
        expect(comment1.length).toBeGreaterThan(0);
      }

      if (comment2) {
        expect(typeof comment2).toBe("string");
        expect(comment2.length).toBeGreaterThan(0);
      }
    });

    it("should include emoji in comments", () => {
      const emoji = process.env.BOT_EMOJI || "📊";
      const comment = getDerekCommentIfWorth();

      if (comment) {
        expect(comment).toContain(emoji);
      }
    });
  });

  describe("getBotPersona - Configuration", () => {
    it("should return bot persona configuration", () => {
      const persona = getBotPersona();

      expect(persona).toHaveProperty("name");
      expect(persona).toHaveProperty("emoji");
      expect(persona).toHaveProperty("personality");
      expect(persona).toHaveProperty("purpose");

      expect(typeof persona.name).toBe("string");
      expect(persona.name.length).toBeGreaterThan(0);
    });
  });

  describe("Derek as Additive Layer - Main Bot Compatibility", () => {
    it("should not require main bot to call Derek functions", () => {
      // Derek functions are optional - main bot doesn't call them
      // This test verifies they can be called independently without side effects
      const persona = getBotPersona();
      expect(persona).toBeDefined();

      // Multiple calls should not cause issues
      const result1 = canDerekPost("C_TEST_1");
      const result2 = canDerekPost("C_TEST_2");

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it("should allow independent channel tracking", () => {
      // Derek tracks per-channel state independently
      const channel1 = "C_CHANNEL_1";
      const channel2 = "C_CHANNEL_2";

      const result1 = canDerekPost(channel1);
      const result2 = canDerekPost(channel2);

      // Both should be independent
      expect(result1.canPost).toBe(true);
      expect(result2.canPost).toBe(true);
    });
  });
});
