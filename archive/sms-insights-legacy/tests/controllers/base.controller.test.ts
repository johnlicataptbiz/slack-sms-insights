import { beforeEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { BaseController, type RequestContext } from '../../src/controllers/base.controller';
import { TestUtils } from '../utils/test-helpers';

// Mock logger
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
};

// Create a concrete implementation for testing
class TestController extends BaseController {
  async execute(context: RequestContext): Promise<void> {
    // Test implementation
    context.res.writeHead(200, { 'Content-Type': 'application/json' });
    context.res.end(JSON.stringify({ success: true }));
  }
}

describe('BaseController', () => {
  let controller: TestController;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    controller = new TestController(mockLogger as any);
    mockReq = TestUtils.createMockRequest();
    mockRes = {
      ...TestUtils.createMockResponse(),
      writeHead: () => {},
      end: () => {},
    };
  });

  describe('constructor', () => {
    it('should initialize with logger', () => {
      assert(controller instanceof BaseController);
      assert(controller instanceof TestController);
    });
  });

  describe('handleRequest', () => {
    it('should handle successful requests', async () => {
      let writeHeadCalled = false;
      let endCalled = false;
      mockRes.writeHead = (status: number, headers: any) => {
        writeHeadCalled = true;
        assert.equal(status, 200);
        assert.deepEqual(headers, { 'Content-Type': 'application/json' });
      };
      mockRes.end = (data: string) => {
        endCalled = true;
        assert.equal(data, JSON.stringify({ success: true }));
      };

      await (controller as any).handleRequest(mockReq, mockRes, {}, {}, {});

      assert(writeHeadCalled);
      assert(endCalled);
    });

    it('should handle errors gracefully', async () => {
      // Create a controller that throws an error
      class ErrorController extends BaseController {
        async execute(context: RequestContext): Promise<void> {
          throw new Error('Test error');
        }
      }

      const errorController = new ErrorController(mockLogger as any);

      let errorLogged = false;
      let writeHeadCalled = false;
      mockLogger.error = () => { errorLogged = true; };
      mockRes.writeHead = (status: number, headers: any) => {
        writeHeadCalled = true;
        assert.equal(status, 500);
        assert(headers['Content-Type'] === 'application/json');
        assert(headers['X-Content-Type-Options'] === 'nosniff');
        assert(headers['X-Frame-Options'] === 'DENY');
      };

      await (errorController as any).handleRequest(mockReq, mockRes, {}, {}, {});

      assert(errorLogged);
      assert(writeHeadCalled);
    });
  });
});
