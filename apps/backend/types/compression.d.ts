declare module 'compression' {
  import type { IncomingMessage, ServerResponse } from 'node:http';
  
  interface CompressionOptions {
    filter?: (req: IncomingMessage, res: ServerResponse) => boolean;
    chunkSize?: number;
    level?: number;
    memLevel?: number;
    strategy?: number;
    threshold?: number;
    windowBits?: number;
    flush?: number;
    finishFlush?: number;
    brotli?: {
      enabled?: boolean;
      chunkSize?: number;
      params?: Record<number, number>;
    };
    gzip?: boolean;
    deflate?: boolean;
    enforceEncoding?: string;
  }

  type CompressionMiddleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ) => void;

  function compression(options?: CompressionOptions): CompressionMiddleware;
  
  namespace compression {
    function filter(req: IncomingMessage, res: ServerResponse): boolean;
  }
  
  export default compression;
}
