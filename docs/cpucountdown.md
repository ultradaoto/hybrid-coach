# CPU Client Context & Session Management Implementation

## 🎯 Overview
This document outlines the CPU-side implementation for comprehensive client context management, session timing, and post-call rating system that coordinates with GPU Claude's transcript management system.

## 📋 Implementation Components

### Phase 1: Database Schema Extensions

#### Prisma Schema Updates:
```prisma
// Extend Profile model for client context
model Profile {
  id           String @id @default(cuid())
  userId       String @unique  
  bioJson      Json?
  // NEW CLIENT CONTEXT FIELDS
  clientFacts  String[] // Facts about client
  challenges   String[] // Current challenges
  preferences  Json?    // Communication preferences
  lastSummary  String?  // Last session summary
  contextNotes String?  // Coach notes
  user         User @relation(fields: [userId], references: [id])
}

// NEW SessionRating model
model SessionRating {
  id        String   @id @default(cuid())
  sessionId String   @unique
  rating    Int      // 1-5 stars
  comment   String?  // Optional feedback
  tipAmount Float?   // $1, $3, or $5
  createdAt DateTime @default(now())
  session   Session  @relation(fields: [sessionId], references: [id])
}

// Extend Session model
model Session {
  id              String         @id @default(cuid())
  roomId          String
  startedAt       DateTime       @default(now())
  endedAt         DateTime?
  userId          String
  summary         String?
  appointmentId   String
  // NEW SESSION FIELDS
  durationMinutes Int           @default(20)
  transcript      String?       // Full conversation transcript
  aiSummary       String?       // AI-generated summary
  status          String        @default("active")
  warningsSent    Int           @default(0)
  rating          SessionRating?
  // ... existing relations
}
```

### Phase 2: Session Timer & Management System

#### SessionTimer Class:
```javascript
class SessionTimer {
  constructor(sessionId, durationMinutes = 20) {
    this.sessionId = sessionId;
    this.duration = durationMinutes * 60 * 1000;
    this.startTime = Date.now();
    this.warnings = [
      { at: 18 * 60 * 1000, type: '2min', sent: false },
      { at: 19 * 60 * 1000, type: '1min', sent: false },
      { at: 19.5 * 60 * 1000, type: '30sec', sent: false }
    ];
    this.isActive = true;
  }
  
  checkWarnings() {
    const elapsed = Date.now() - this.startTime;
    // Send time warnings to GPU
    // Update session status in database
  }
  
  initiateEndSequence() {
    // Send session_ending to GPU
    // Start 5-second countdown UI
    // Prepare for session rating page
  }
}
```

#### WebSocket Protocol with GPU:
```javascript
// Send client context on session start
{
  type: 'client_context',
  sessionId: sessionId,
  clientProfile: {
    facts: profile.clientFacts,
    challenges: profile.challenges,
    lastSummary: profile.lastSummary,
    preferences: profile.preferences
  }
}

// Send time warnings
{
  type: 'time_warning',
  sessionId: sessionId,
  minutesRemaining: 2, // or 1, or 0.5
  totalElapsed: elapsedTime
}

// Trigger session ending
{
  type: 'session_ending', 
  sessionId: sessionId,
  finalWarning: true
}
```

### Phase 3: Post-Call Rating System

#### New Route: `/session/:sessionId/rate`
- Beautiful star rating interface (1-5 stars)
- Optional comment text area
- Tip selection buttons ($1, $3, $5)
- Session summary display
- Coach information
- "Complete Rating" button

#### Rating Controller:
```javascript
// GET /session/:sessionId/rate
export const showRatingPage = async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { id: req.params.sessionId },
    include: { 
      appointment: { include: { coach: true } },
      user: true 
    }
  });
  
  res.render('session-rating', { 
    session, 
    coach: session.appointment.coach,
    client: session.user 
  });
};

// POST /session/:sessionId/rate  
export const submitRating = async (req, res) => {
  const { rating, comment, tipAmount } = req.body;
  
  await prisma.sessionRating.create({
    data: {
      sessionId: req.params.sessionId,
      rating: parseInt(rating),
      comment: comment || null,
      tipAmount: tipAmount ? parseFloat(tipAmount) : null
    }
  });
  
  res.redirect('/dashboard');
};
```

### Phase 4: GPU Message Handlers

#### Handle Session Summary from GPU:
```javascript
case 'session_summary':
  await handleSessionSummary(data);
  break;

async function handleSessionSummary(data) {
  // Update session with transcript and summary
  await prisma.session.update({
    where: { id: data.sessionId },
    data: {
      transcript: data.transcript,
      aiSummary: data.summary,
      endedAt: new Date(),
      status: 'completed'
    }
  });
  
  // Update client profile with new summary
  const session = await prisma.session.findUnique({
    where: { id: data.sessionId },
    include: { user: { include: { profile: true } } }
  });
  
  await prisma.profile.update({
    where: { userId: session.userId },
    data: {
      lastSummary: data.summary,
      // Update client facts/challenges based on AI insights
    }
  });
  
  // Trigger countdown UI and redirect to rating
  initiateSessionEnd(data.sessionId);
}
```

### Phase 5: Countdown & Redirect System

#### 5-Second Countdown UI:
- Full-screen overlay with countdown
- "Thank you for your session!" message
- Automatic redirect to rating page
- Option to "Rate Now" (skip countdown)

#### End-of-Session Flow:
1. GPU sends session_summary → CPU processes
2. CPU shows countdown overlay (5-4-3-2-1)
3. Automatic redirect to `/session/:id/rate`
4. Client rates session and tips coach
5. Redirect to dashboard with "Session Complete" message

### Phase 6: Client Profile Management

#### Admin Interface for Coaches:
- Edit client facts, challenges, preferences
- View session history and summaries
- Add context notes before sessions
- Review client progress over time

#### Context Loading System:
- Load client profile before session starts
- Send comprehensive context to GPU
- Update profile based on session insights
- Maintain continuity across sessions

## 🔄 Complete Flow Integration:

1. **Session Start**: ✅ Load client context → Send to GPU
2. **During Session**: ✅ Monitor time → Send warnings to GPU
3. **Session End**: ✅ Receive summary from GPU → Store in database
4. **Countdown**: ✅ 5-second UI → Redirect to rating
5. **Rating**: ✅ Collect feedback → Update client profile
6. **Next Session**: ✅ Enhanced context from previous sessions

## ✅ IMPLEMENTATION STATUS: COMPLETE

All core components have been successfully implemented:

### ✅ Completed Components:
- **Database Schema**: Extended Profile and Session models with client context fields
- **SessionTimer Class**: Complete with time warnings and graceful ending
- **Session Rating System**: Beautiful star rating page with tips and feedback
- **Client Context Loading**: Automatic profile loading and GPU coordination
- **WebSocket Handlers**: Complete message handling for session management
- **API Endpoints**: Session summary and context update storage
- **Countdown UI**: 5-second countdown with redirect to rating page
- **Full Integration**: Complete session lifecycle from start to rating

## 🤝 GPU Coordination Points:

### Messages Sent to GPU:
- `client_context`: Load client profile and context
- `time_warning`: Send timing warnings (2min, 1min, 30sec)
- `session_ending`: Trigger end-of-session summary

### Messages Received from GPU:
- `session_summary`: Complete transcript and AI-generated summary
- `context_update`: Suggested updates to client profile
- `session_complete`: Confirmation of graceful session ending

## 🎯 Expected Outcomes:
- **Personalized Experience**: AI remembers clients and references previous sessions
- **Professional Time Management**: Natural warnings and graceful session endings
- **Progress Tracking**: Detailed summaries and client growth over time
- **Quality Feedback**: Star ratings and tip system for coach evaluation
- **Seamless Handoffs**: Complete session data for follow-up and continuity

This creates a **professional, personalized coaching experience** that maintains continuity and tracks meaningful client progress! 🌟