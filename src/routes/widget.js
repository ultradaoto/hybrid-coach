import { Router } from 'express';

const router = Router();

// Main widget page - clean and simple
router.get('/', (req, res) => {
  try {
    res.render('widget', {
      title: 'ElevenLabs Voice Agent',
      layout: false,
      user: req.user || null
    });
  } catch (error) {
    console.error('Error rendering widget page:', error);
    res.status(500).send('Error loading voice agent');
  }
});

// API endpoint for widget status
router.get('/api/status', (req, res) => {
  res.json({
    status: 'active',
    timestamp: new Date().toISOString(),
    message: 'ElevenLabs voice agent is ready'
  });
});

// API endpoint for widget events
router.post('/api/events', (req, res) => {
  try {
    const { eventType, data } = req.body;
    console.log(`[Voice Agent Event] ${eventType}:`, data);

    res.json({
      success: true,
      message: `Event ${eventType} processed`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing voice agent event:', error);
    res.status(500).json({
      error: 'Failed to process event',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;