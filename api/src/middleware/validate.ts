import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Invalid request body',
        details: (result.error as ZodError).errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Invalid query parameters',
        details: (result.error as ZodError).errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
      return;
    }
    req.query = result.data as Record<string, string>;
    next();
  };
}
