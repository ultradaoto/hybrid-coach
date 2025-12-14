# ElevenLabs Integration Documentation

## Current Implementation

### Dynamic Variables
We're passing the following dynamic variables to the ElevenLabs widget:

1. **user_name**: The display name of the user (defaults to "Kirby" in development)
2. **session_id**: Unique session identifier for tracking conversations
3. **room_id**: The room ID for associating conversations with specific sessions

### Widget Integration
```html
<elevenlabs-convai 
    agent-id="agent_01jy88zv6zfe1a9v9zdxt69abd"
    dynamic-variables='{"user_name": "Kirby", "session_id": "xxx", "room_id": "yyy"}'
></elevenlabs-convai>
```

## Future Enhancements

### 1. Webhook Integration for Data Collection

#### POST Webhooks (Send data to ElevenLabs)
- Pass user context and preferences
- Update conversation state
- Send coaching history

#### GET Webhooks (Receive from ElevenLabs)
- Capture conversation summaries
- Extract key insights from sessions
- Track user progress and goals

### 2. Tool Integration
ElevenLabs supports custom tools that can:
- Update dynamic variables during conversation
- Query our database for user history
- Store conversation insights

### 3. Conversation Data Storage

We need to implement:

```javascript
// Example webhook endpoint for receiving conversation data
app.post('/api/elevenlabs/webhook', async (req, res) => {
    const { 
        conversation_id,
        user_name,
        summary,
        key_points,
        action_items 
    } = req.body;
    
    // Store in database
    await prisma.conversationSummary.create({
        data: {
            conversationId: conversation_id,
            userName: user_name,
            summary: summary,
            keyPoints: key_points,
            actionItems: action_items,
            timestamp: new Date()
        }
    });
    
    res.json({ success: true });
});
```

### 4. Personalization Features

#### User Profile Building
- Track conversation topics
- Identify recurring challenges
- Monitor progress over time

#### Dynamic Prompt Customization
Based on user history:
- Adjust coaching style
- Reference previous conversations
- Track goal achievement

### 5. Database Schema Requirements

```sql
-- Conversation summaries table
CREATE TABLE conversation_summaries (
    id SERIAL PRIMARY KEY,
    conversation_id VARCHAR(255) UNIQUE,
    room_id VARCHAR(255),
    user_name VARCHAR(255),
    summary TEXT,
    key_points JSONB,
    action_items JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User insights table
CREATE TABLE user_insights (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    insight_type VARCHAR(100),
    insight_data JSONB,
    conversation_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Implementation Steps

### Phase 1: Basic Integration ✅
- [x] Pass user_name to widget
- [x] Pass session_id for tracking
- [x] Pass room_id for association

### Phase 2: Data Collection (Next)
- [ ] Create webhook endpoints
- [ ] Set up database tables
- [ ] Implement conversation summary storage

### Phase 3: Personalization
- [ ] Build user profile system
- [ ] Implement conversation history
- [ ] Add context to AI prompts

### Phase 4: Advanced Features
- [ ] Custom tools for database queries
- [ ] Real-time variable updates
- [ ] Progress tracking dashboard

## Testing Dynamic Variables

In development, the widget receives:
- `user_name`: "Developer User" or "Kirby" (fallback)
- `session_id`: Generated UUID for the session
- `room_id`: Unique room identifier

To test with different names:
1. Modify the fallback in room-client.ejs
2. Or pass different values from the controller

## Security Considerations

### Secret Variables
For sensitive data, use the `secret__` prefix:
```javascript
dynamic-variables='{"user_name": "John", "secret__auth_token": "xxx"}'
```

Secret variables:
- Are never sent to LLM providers
- Only used in headers and tool calls
- Should contain auth tokens or private IDs

## Resources
- [ElevenLabs Dynamic Variables Docs](https://elevenlabs.io/docs/conversational-ai/customization/dynamic-variables)
- [ElevenLabs Tools Documentation](https://elevenlabs.io/docs/conversational-ai/customization/tools)
- [Webhook Integration Guide](https://elevenlabs.io/docs/conversational-ai/api-reference)
