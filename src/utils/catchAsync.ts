import { Request, Response, NextFunction } from "express";

export type AsyncController = (
  req: Request | any,
  res: Response,
  next: NextFunction
) => Promise<any>;

/**
 * Wraps async controller functions to eliminate repetitive try-catch blocks.
 * Automatically catches rejected promises and forwards them to Express next(err).
 */
export const catchAsync = (fn: AsyncController) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};
