import { Router } from 'express';

const router = Router();

// Widget inspector page
router.get('/', (req, res) => {
  try {
    res.render('widget', {
      title: 'ElevenLabs Widget Inspector',
      layout: false, // Don't use the default layout since this is a standalone page
      user: req.user || null
    });
  } catch (error) {
    console.error('Error rendering widget page:', error);
    res.status(500).send('Error loading widget inspector');
  }
});

// API endpoint to get widget status (for future integration)
router.get('/api/status', (req, res) => {
  try {
    res.json({
      status: 'active',
      timestamp: new Date().toISOString(),
      message: 'ElevenLabs widget inspector is running'
    });
  } catch (error) {
    console.error('Error getting widget status:', error);
    res.status(500).json({ 
      error: 'Failed to get widget status',
      timestamp: new Date().toISOString()
    });
  }
});

// API endpoint for widget events (for future WebRTC streaming integration)
router.post('/api/events', (req, res) => {
  try {
    const { eventType, data } = req.body;
    
    console.log(`[Widget Event] ${eventType}:`, data);
    
    // Here you could forward events to the GPU server for orb integration
    // or process widget state changes for WebRTC streaming
    
    res.json({
      success: true,
      message: `Event ${eventType} received`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing widget event:', error);
    res.status(500).json({ 
      error: 'Failed to process widget event',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;