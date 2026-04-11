import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} from "./errors.js";

export {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
};

export function createApiError(message: string, statusCode: number = 500) {
  return new AppError(message, statusCode);
}

/**
 * Centralized error handling middleware
 */
export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  console.error("Unhandled Error:", err);

  // Handle AppError hierarchy
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: "Validation Failed",
      details: err.issues.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    });
  }

  // Handle Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        return res.status(409).json({
          success: false,
          error: "Unique Constraint Violation",
          details: "A record with these details already exists",
        });
      case "P2025":
        return res.status(404).json({
          success: false,
          error: "Record Not Found",
          details: "The requested resource could not be found",
        });
      default:
        return res.status(500).json({
          success: false,
          error: "Database Error",
          details:
            process.env.NODE_ENV === "production"
              ? "An unexpected error occurred"
              : err.message,
        });
    }
  }

  // Generic fallback
  res.status(500).json({
    success: false,
    error:
      process.env.NODE_ENV === "production"
        ? "Internal Server Error"
        : err.message,
  });
}
