import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { redisCache } from '../utils/redis-cache';

/**
 * Authentication middleware for protecting routes
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ 
      success: false, 
      error: 'No authentication token provided' 
    });
  }

  const token = authHeader.split(' ')[1]; // Bearer TOKEN

  try {
    // Verify token
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'fallback_secret'
    ) as { userId: string; role: string; exp: number };

    // Check if session is valid in Redis cache
    const session = await redisCache.get(`session:${decoded.userId}`);
    
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid or expired session' 
      });
    }

    // Attach user information to request
    req.user = {
      id: decoded.userId,
      role: decoded.role
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token expired' 
      });
    }

    return res.status(403).json({ 
      success: false, 
      error: 'Authentication failed' 
    });
  }
}

/**
 * Role-based authorization middleware
 * @param allowedRoles Array of roles allowed to access the route
 */
export function roleMiddleware(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Insufficient permissions' 
      });
    }

    next();
  };
}