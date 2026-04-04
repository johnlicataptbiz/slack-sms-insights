import { Router, Request, Response } from 'express';
import { PrismaClient, type Prisma } from '@prisma/client';
import { queryParserMiddleware, createPaginatedResponse } from '../middleware/query-parser';
import { createRequestValidator, ValidationSchemas } from '../middleware/request-validator';
import { errorHandlerMiddleware, createApiError } from '../utils/error-handler';

const prisma = new PrismaClient();
const router = Router();

/**
 * Get conversations endpoint with advanced filtering and pagination
 */
router.get('/conversations',
  createRequestValidator({ query: ValidationSchemas.PaginationQuery }),
  queryParserMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { pagination, filtering } = req;

      // Build dynamic Prisma query with proper types
      const whereConditions: Prisma.ConversationWhereInput = {};

      // Apply filtering
      if (filtering?.filter) {
        Object.entries(filtering.filter).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            // Handle complex filter conditions
            whereConditions[key] = {
              ...(value.$gte && { gte: value.$gte }),
              ...(value.$lte && { lte: value.$lte }),
              ...(value.$contains && { contains: value.$contains })
            };
          } else {
            // Simple equality filter
            whereConditions[key] = value;
          }
        });
      }

      // Apply sorting
      const orderByObj: Prisma.ConversationOrderByWithRelationInput = {};
      if (filtering?.sort) {
        Object.entries(filtering.sort).forEach(([key, direction]) => {
          orderByObj[key as keyof Prisma.ConversationOrderByWithRelationInput] = direction as Prisma.SortOrder;
        });
      }

      // Fetch total count for pagination
      const totalCount = await prisma.conversation.count({
        where: whereConditions
      });

      // Fetch paginated conversations
      const conversations = await prisma.conversation.findMany({
        where: whereConditions,
        orderBy: Object.keys(orderByObj).length > 0 ? orderByObj : { createdAt: 'desc' },
        take: pagination?.limit,
        skip: pagination ? (pagination.page - 1) * pagination.limit : 0,
        // Optionally select specific fields if requested
        ...(filtering?.select && { 
          select: filtering.select.reduce((acc, field) => {
            acc[field] = true;
            return acc;
          }, {}) 
        })
      });

      // Create paginated response
      res.json(createPaginatedResponse(
        conversations, 
        totalCount, 
        pagination!
      ));
    } catch (error) {
      // Pass to error handling middleware
      errorHandlerMiddleware(error as Error, req, res, () => {});
    }
});

/**
 * Create a new conversation
 */
router.post('/conversations', 
  createRequestValidator({ body: ValidationSchemas.ConversationCreate }),
  async (req: Request, res: Response) => {
    try {
      const newConversation = await prisma.conversation.create({
        data: req.body
      });

      res.status(201).json(newConversation);
    } catch (error) {
      errorHandlerMiddleware(error as Error, req, res, () => {});
    }
});

/**
 * Update an existing conversation
 */
router.patch('/conversations/:id', 
  createRequestValidator({ 
    params: ValidationSchemas.IdParam,
    body: ValidationSchemas.ConversationUpdate 
  }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updatedConversation = await prisma.conversation.update({
        where: { id },
        data: req.body
      });

      res.json(updatedConversation);
    } catch (error) {
      // Handle not found or other errors
      if (error instanceof Error && error.message.includes('Record not found')) {
        return errorHandlerMiddleware(
          createApiError('Conversation not found', 404, 'NOT_FOUND'), 
          req, 
          res, 
          () => {}
        );
      }
      errorHandlerMiddleware(error as Error, req, res, () => {});
    }
});

export default router;