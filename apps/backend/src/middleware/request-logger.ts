import type { NextFunction, Request, Response } from "express";

const redactSensitive = (url: string): string => {
  return url.replace(
    /(phone|token|password|secret|key)=[^&]*/gi,
    "$1=[REDACTED]",
  );
};

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const start = Date.now();

  // Log request (redact sensitive params, omit raw IP)
  console.log(`${req.method} ${redactSensitive(req.url)}`);

  // Log response when finished
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `${req.method} ${redactSensitive(req.url)} - ${res.statusCode} - ${duration}ms`,
    );
  });

  next();
};
