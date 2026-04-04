import express from 'express';
import { AlowareProcessor } from '../services/aloware-processor.js';
import { logger } from '../services/logger.js';

const router = express.Router();
const processor = new AlowareProcessor();

router.post('/sms', async (req, res) => {
  try {
    logger.info('Received Aloware webhook request', { body: req.body });
    await processor.processWebhook(req.body);
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Aloware webhook processing failed', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

export default router;
