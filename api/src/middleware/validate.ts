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
    // Express 5 exposes req.query as a getter-only property, so assigning to
    // it throws ("Cannot set property query ... which has only a getter") and
    // every route using validateQuery returned 500. Define an own property to
    // shadow the getter with the validated (and coerced) values.
    Object.defineProperty(req, 'query', {
      value: result.data as Record<string, string>,
      writable: true,
      enumerable: true,
      configurable: true
    });
    next();
  };
}
