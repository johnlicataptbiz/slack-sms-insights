import express from 'express';
import { ConversationController } from '../controllers/conversation.controller';
import { CacheMiddleware } from '../middleware/cache-middleware';
import { createQueryParserMiddleware } from '../middleware/query-parser';
import { ConversationValidator } from '../validators/conversation-validator';

export function createConversationRoutes(logger: any) {
  const router = express.Router();
  const controller = new ConversationController(logger);

  // GET conversations with caching and query parsing
  router.get(
    '/', 
    createQueryParserMiddleware(ConversationValidator.conversationQuery),
    CacheMiddleware.cache({ 
      ttl: 3600,  // 1 hour cache
      keyPrefix: 'conversations:' 
    }),
    async (req, res) => {
      try {
        const result = await controller.getConversations({ 
          req, 
          res, 
          query: req.parsedQuery, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('Conversation retrieval error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // POST create conversation
  router.post(
    '/',
    createQueryParserMiddleware(ConversationValidator.createConversation),
    async (req, res) => {
      try {
        const result = await controller.createConversation({ 
          req, 
          res, 
          body: req.parsedQuery, 
          logger 
        });

        res.status(result.success ? 201 : 400).json(result);
      } catch (error) {
        logger.error('Conversation creation error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // PATCH update conversation
  router.patch(
    '/:id',
    createQueryParserMiddleware(ConversationValidator.updateConversation),
    async (req, res) => {
      try {
        const result = await controller.updateConversation({ 
          req, 
          res, 
          body: {
            ...req.parsedQuery,
            id: req.params.id
          }, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('Conversation update error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // POST add message to conversation
  router.post(
    '/:id/messages',
    createQueryParserMiddleware(ConversationValidator.addMessage),
    async (req, res) => {
      try {
        const result = await controller.addMessage({ 
          req, 
          res, 
          body: {
            ...req.parsedQuery,
            conversationId: req.params.id
          }, 
          logger 
        });

        res.status(result.success ? 201 : 400).json(result);
      } catch (error) {
        logger.error('Message addition error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  return router;
}