import express from 'express';
import { AlowareProcessor } from '../services/aloware-processor';

const router = express.Router();
const processor = new AlowareProcessor();

router.post('/sms', async (req, res) => {
  try {
    await processor.processWebhook(req.body);
    res.status(200).send('OK');
  } catch (error) {
    res.status(500).json({ error: 'Processing failed' });
  }
});

export default router;