import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockFactories, TestUtils } from './utils/test-helpers';

// Example unit test for a utility function
describe('TestUtils', () => {
  describe('createMockRequest', () => {
    it('creates a basic request object', () => {
      const req = TestUtils.createMockRequest();

      expect(req.body).toEqual({});
      expect(req.params).toEqual({});
      expect(req.query).toEqual({});
      expect(req.method).toBe('GET');
    });

    it('overrides default properties', () => {
      const req = TestUtils.createMockRequest({
        body: { name: 'test' },
        method: 'POST',
      });

      expect(req.body).toEqual({ name: 'test' });
      expect(req.method).toBe('POST');
    });
  });

  describe('createMockResponse', () => {
    it('creates a response object with spy methods', () => {
      const res = TestUtils.createMockResponse();

      res.status(200).json({ success: true });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });
});

// Example integration test
describe('Database Operations', () => {
  const mockPrisma = mockFactories.prismaClient();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('conversation repository', () => {
    it('creates a conversation', async () => {
      const conversationData = {
        id: '123',
        channelId: 'C123',
        message: 'Test message',
        timestamp: new Date(),
      };

      mockPrisma.conversation.create.mockResolvedValue(conversationData);

      const result = await mockPrisma.conversation.create({
        data: conversationData,
      });

      expect(result).toEqual(conversationData);
      expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
        data: conversationData,
      });
    });

    it('finds conversations by channel', async () => {
      const conversations = [
        { id: '1', channelId: 'C123', message: 'Message 1' },
        { id: '2', channelId: 'C123', message: 'Message 2' },
      ];

      mockPrisma.conversation.findMany.mockResolvedValue(conversations);

      const result = await mockPrisma.conversation.findMany({
        where: { channelId: 'C123' },
      });

      expect(result).toEqual(conversations);
      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
        where: { channelId: 'C123' },
      });
    });
  });
});

// Parametrized test example
describe.each([
  { input: 2, expected: 4 },
  { input: 3, expected: 9 },
  { input: 4, expected: 16 },
])('Math operations', ({ input, expected }) => {
  it(`squares ${input} to ${expected}`, () => {
    expect(input * input).toBe(expected);
  });
});
