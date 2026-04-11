import type { IncomingMessage, ServerResponse } from "node:http";
import type { Request, Response } from "express";
import { getPrismaClient } from "../../services/prisma";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Request context that can handle both node:http and Express requests.
 * We keep IncomingMessage and ServerResponse as base types to maintain
 * compatibility with legacy handleApiRoute in api/routes.ts.
 */
export interface RequestContext {
  req: IncomingMessage | Request;
  res: ServerResponse | Response;
  logger: Console;
  params: Record<string, string>;
  query: Record<string, any>;
  body?: any;
  user?: {
    id: string;
    role: string;
  };
}

export abstract class BaseController {
  protected logger: Console;
  protected prisma = getPrismaClient() as any;

  constructor(logger: Console) {
    this.logger = logger;
  }

  protected async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
    query: Record<string, string>,
    body?: unknown,
  ): Promise<void> {
    const context: RequestContext = {
      req,
      res,
      logger: this.logger,
      params,
      query,
      body,
    };

    try {
      await this.execute(context);
    } catch (error) {
      await this.handleError(context, error);
    }
  }

  protected abstract execute(context: RequestContext): Promise<void>;

  protected async handleError(
    context: RequestContext,
    error: unknown,
  ): Promise<void> {
    const { res, logger } = context;

    logger.error("Controller error:", error);

    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const message =
      error instanceof Error ? error.message : "Internal server error";

    this.sendJsonResponse(res, { success: false, error: message }, statusCode);
  }

  protected sendJsonResponse<T>(
    res: ServerResponse,
    data: ApiResponse<T>,
    statusCode = 200,
  ): void {
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    res.end(JSON.stringify(data));
  }

  protected sendSuccessResponse<T>(
    res: ServerResponse,
    data: T,
    statusCode = 200,
  ): void {
    this.sendJsonResponse(res, { success: true, data }, statusCode);
  }

  protected sendErrorResponse(
    res: ServerResponse,
    message: string,
    statusCode = 400,
  ): void {
    this.sendJsonResponse(res, { success: false, error: message }, statusCode);
  }
}

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class NotFoundError extends HttpError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Unauthorized") {
    super(401, message);
  }
}
