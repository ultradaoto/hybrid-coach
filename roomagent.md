# 🎯 AI Voice Agent Room System

## Overview
The AI Voice Agent Room System provides personalized coaching sessions where Skool community members can interact with an ElevenLabs-powered AI coach in a dedicated virtual room environment.

## Core Features

### 🎥 **Video & Audio Setup**
- **Client Camera**: ✅ Enabled by default
  - Client can see themselves on video (self-stream)
  - Video feeds back to the same user (no external streaming for now)
  - Camera can be toggled on/off by client
  
- **Client Microphone**: ✅ Enabled by default  
  - Required for voice interaction with AI agent
  - Audio can be muted/unmuted by client
  - Voice is processed by ElevenLabs for AI conversation

- **No WebSocket Streaming**: ❌ Currently disabled
  - Video/audio stays local to client
  - Future enhancement for multi-party sessions

### 🤖 **AI Voice Agent Integration**
- **ElevenLabs Widget**: Core AI interaction component
  - Embedded in dedicated "AI Coach" video window
  - Real-time voice conversation capabilities
  - Agent ID: `agent_01jy88zv6zfe1a9v9zdxt69abd`
  
- **Visual Representation**: AI appears in its own video box
  - Positioned alongside client's self-view
  - Clear labeling: "AI Coach"
  - Voice activity indicators

### 👨‍🏫 **Coach Window (Future Feature)**
- **Status**: 🚧 Coming Soon placeholder
- **Display**: Greyed out box with "Feature Coming Soon" message
- **Purpose**: Familiarize users with future 3-way coaching sessions
- **Future Goal**: Live human coach can join AI + client sessions

## Room State Management

### 🏠 **Individual Room System**
- **Unique Room IDs**: Each client gets isolated room environment
- **No Room Overlap**: Prevents users from joining each other's sessions
- **Session Persistence**: Room state maintained during session
- **Auto-Cleanup**: Rooms cleaned up after session ends

### 🔐 **Authentication**
- **Skool Authentication**: Required for room access
- **Development Bypass**: Available for local testing
- **User Context**: Room knows client's Skool identity

## Data Collection & Personalization

### 📊 **Client Conversation Data**
- **Database Schema**: Prisma-based data storage
- **Conversation History**: Track previous AI interactions
- **Personalization Data**: Store client preferences, challenges, goals
- **Session Context**: Maintain context across multiple sessions

### 🔄 **ElevenLabs WebSocket Integration** (Future)
- **Real-time Data Exchange**: Send/receive session data
- **Contextual Responses**: AI adapts based on previous conversations
- **Learning System**: AI improves responses over time
- **Session Memory**: AI remembers client-specific information

## Technical Architecture

### 🏗️ **Room Structure**
```
/room/create → Creates new room → /room/{roomId}
├── Client Video Box (self-view)
├── AI Coach Box (ElevenLabs widget)  
└── Human Coach Box (placeholder)
```

### 📱 **User Interface**
- **Responsive Design**: Works on desktop and mobile
- **Control Panel**: Video/audio toggle buttons
- **Session Status**: Connection and AI status indicators
- **Clean Exit**: Return to dashboard functionality

### 🗃️ **Database Schema**
```sql
-- Client session tracking
Sessions {
  id, roomId, clientId, startTime, endTime, status
}

-- Conversation data
Conversations {
  id, sessionId, message, sender, timestamp, context
}

-- Client profiles
ClientProfiles {
  id, skoolUserId, preferences, goals, history
}
```

## Development Roadmap

### 🎯 **Phase 1: Core Room System** (Current)
- ✅ Room creation and access
- ✅ Client video/audio setup
- ✅ ElevenLabs AI integration
- 🚧 Coach placeholder implementation

### 🎯 **Phase 2: Data Collection**
- 📊 Conversation tracking
- 💾 Client profile building
- 🔄 Session context persistence

### 🎯 **Phase 3: AI Personalization**
- 🧠 AI memory system
- 📈 Response improvement
- 🎯 Tailored coaching approaches

### 🎯 **Phase 4: Human Coach Integration**
- 👥 3-way video sessions
- 💬 Coach-AI collaboration
- 📅 Scheduled coaching appointments

## Success Metrics

### 📈 **Engagement Tracking**
- Session duration
- Return session frequency  
- AI interaction quality
- User satisfaction scores

### 🎯 **Coaching Effectiveness**
- Goal achievement tracking
- Progress measurement
- Behavioral change indicators
- Community feedback integration

## Technical Notes

### 🔧 **Current Limitations**
- No multi-user sessions yet
- Local video only (no streaming)
- Basic session tracking
- Manual room creation

### 🚀 **Future Enhancements**
- Advanced WebSocket integration
- ML-powered personalization
- Mobile app companion
- Integration with Skool community features

---

*This system represents the foundation for scalable, personalized AI coaching within the Skool community ecosystem.*
