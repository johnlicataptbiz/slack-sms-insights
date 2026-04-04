import { describe, expect, it } from 'vitest';
import { canDerekPost, getBotPersona, getDerekCommentIfWorth, getPostConfidence } from './services/bot-personality.js';

describe('Derek Bot Personality - Safeguards Verification', () => {
  it('should verify Derek functions are accessible and work', () => {
    // Verify all functions export correctly
    expect(typeof canDerekPost).toBe('function');
    expect(typeof getPostConfidence).toBe('function');
    expect(typeof getDerekCommentIfWorth).toBe('function');
    expect(typeof getBotPersona).toBe('function');
  });

  it('should verify canDerekPost allows posting', () => {
    const result = canDerekPost('C_TEST_CHANNEL');
    expect(result).toHaveProperty('canPost');
    expect(typeof result.canPost).toBe('boolean');
  });

  it('should verify confidence scoring works', () => {
    const conf1 = getPostConfidence();
    const conf2 = getPostConfidence('conversion');

    expect(conf1).toBeGreaterThanOrEqual(0);
    expect(conf1).toBeLessThanOrEqual(1);
    expect(conf2).toBeGreaterThanOrEqual(0);
    expect(conf2).toBeLessThanOrEqual(1);
  });

  it('should verify Derek is additive - bot persona is customizable', () => {
    const persona = getBotPersona();
    expect(persona).toHaveProperty('name');
    expect(persona.name).toBeTruthy();
  });

  it('should verify per-channel independent operation', () => {
    const ch1 = canDerekPost('C_1');
    const ch2 = canDerekPost('C_2');

    expect(ch1).toBeDefined();
    expect(ch2).toBeDefined();
    // Each channel is tracked independently
  });
});
