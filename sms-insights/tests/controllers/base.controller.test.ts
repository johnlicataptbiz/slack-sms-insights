import type { Logger } from '@slack/bolt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseController, type RequestContext } from '../../src/controllers/base.controller';
import { TestUtils } from '../utils/test-helpers';

// Mock logger
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
} satisfies Pick<Logger, 'info' | 'error' | 'warn'>;

// Create a concrete implementation for testing
class TestController extends BaseController {
  async execute(context: RequestContext): Promise<void> {
    // Test implementation
    context.res.writeHead(200, { 'Content-Type': 'application/json' });
    context.res.end(JSON.stringify({ success: true }));
  }

  runHandleRequest(...args: Parameters<BaseController['handleRequest']>): ReturnType<BaseController['handleRequest']> {
    return this.handleRequest(...args);
  }
}

describe('BaseController', () => {
  let controller: TestController;
  let mockReq: ReturnType<typeof TestUtils.createMockRequest>;
  let mockRes: ReturnType<typeof TestUtils.createMockResponse>;

  beforeEach(() => {
    controller = new TestController(mockLogger as unknown as Logger);
    mockReq = TestUtils.createMockRequest();
    mockRes = {
      ...TestUtils.createMockResponse(),
      writeHead: vi.fn(),
      end: vi.fn(),
    };
  });

  describe('constructor', () => {
    it('should initialize with logger', () => {
      expect(controller).toBeInstanceOf(BaseController);
      expect(controller).toBeInstanceOf(TestController);
    });
  });

  describe('handleRequest', () => {
    it('should handle successful requests', async () => {
      await controller.runHandleRequest(mockReq, mockRes, {}, {}, {});

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
      expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify({ success: true }));
    });

    it('should handle errors gracefully', async () => {
      // Create a controller that throws an error
      class ErrorController extends BaseController {
        async execute(_context: RequestContext): Promise<void> {
          throw new Error('Test error');
        }

        runHandleRequest(
          ...args: Parameters<BaseController['handleRequest']>
        ): ReturnType<BaseController['handleRequest']> {
          return this.handleRequest(...args);
        }
      }

      const errorController = new ErrorController(mockLogger as unknown as Logger);

      await errorController.runHandleRequest(mockReq, mockRes, {}, {}, {});

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockRes.writeHead).toHaveBeenCalledWith(
        500,
        expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        }),
      );
    });
  });
});
