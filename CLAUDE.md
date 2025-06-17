# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

- **Development**: `npm run dev` - Start development server with nodemon
- **Production**: `npm start` - Start production server 
- **Testing**: `npm test` - Run Jest tests with VM modules support
- **Database**: 
  - `npm run generate` - Generate Prisma client
  - `npm run migrate` - Run database migrations
- **WebRTC Setup**: 
  - `npm run setup-webrtc` - Setup WebRTC components
  - `npm run diagnose` - Diagnose WebRTC issues

## Architecture Overview

### Core Application Structure
- **MVC Pattern**: Express.js with EJS templates, controllers handle business logic
- **Real-time Communication**: Multi-protocol support:
  - Socket.IO for video call signaling with polling-only transport for reliability
  - Protoo signaling for MediaSoup WebRTC 
  - Simple WebSocket fallback for blocked environments
  - WebSocket relay for restrictive network setups

### Authentication & Sessions
- Google OAuth 2.0 via Passport.js
- JWT sessions with role-based access (coach/client)
- WebSocket requests bypass authentication middleware via `req.wsRequest` flag

### Database Design (Prisma + PostgreSQL)
Key models and relationships:
- **User**: Core entity with Google OAuth, supports coach/client roles
- **Appointment**: Scheduled sessions between coach and client with unique roomId
- **Session**: Multiple sessions per appointment, tracks actual call instances
- **Message**: Chat messages within sessions
- **Profile**: Extended user data stored as JSON

### Video Calling Architecture
**Multi-layered approach for different network conditions:**
1. **MediaSoup + Protoo**: Primary WebRTC solution for production calls
2. **Simple WebRTC**: Socket.IO-based fallback with SimplePeer
3. **WebSocket Relay**: For environments where WebRTC is completely blocked
4. **Room Management**: Automatic timer start when second participant joins

### AI Integration Strategy
- Local LLM deployment on DigitalOcean GPU droplet
- Services include: AI coaching (`aiService.js`), TTS (`ttsService.js`)
- Tri-party calls: Coach + Client + AI with dynamic speaker handoff
- Speech transcription and response generation pipeline

### Key Technical Decisions
- **ES Modules**: Uses `type: "module"` with import/export syntax
- **WebSocket Bypass**: Special middleware logic allows WebSocket upgrades to skip auth
- **Transport Strategy**: Socket.IO configured for polling-only to avoid connection issues
- **TURN Server Integration**: Twilio TURN service for NAT traversal

### Environment Configuration
Required environment variables:
- Database: `DATABASE_URL`
- Auth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`
- Server: `PORT`, `HOST` (defaults to 127.0.0.1 for security)

### Skool Membership Monitoring System
**Automated membership tracking via Playwright browser automation:**
- **Daily sync**: Monitors Ultra Skool (coaches) and Vagus Skool (clients) memberships
- **Role hierarchy**: Ultra Skool supersedes Vagus Skool, grace periods for cancelled Ultra members
- **Database tracking**: Membership status, subscription dates, change history
- **Browser automation**: Headless Chromium with stealth measures for Skool scraping
- **Error handling**: Comprehensive logging, retry logic, failure notifications

**Key Commands:**
- `npm run sync-skool` - Manual membership sync for testing
- Set `MONITORING_ENABLED=true` in .env to enable daily automated sync
- Logs stored in `logs/skool-monitoring.log` and `logs/skool-daemon.log`

**Environment Variables Required:**
```
SKOOL_EMAIL=your.monitoring.account@email.com
SKOOL_PASSWORD=your_secure_password
MONITORING_ENABLED=true
PLAYWRIGHT_HEADLESS=true
```

### Testing Strategy
- Jest with experimental VM modules support
- Supertest for API endpoints
- `--detectOpenHandles --runInBand` flags for proper cleanup