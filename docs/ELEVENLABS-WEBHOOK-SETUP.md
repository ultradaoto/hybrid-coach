# ElevenLabs Webhook Setup Guide

## ✅ Server-side Setup (Complete)

Your webhook endpoint is ready at:
- **URL**: `https://myultra.coach/api/webhooks/user-info`
- **Method**: GET
- **Purpose**: Provides user information to ElevenLabs AI

### Test the endpoint:
```bash
# Test with development server
curl "http://localhost:3000/api/webhooks/user-info?user_name=Kirby&session_id=test123"

# Test with production server
curl "https://myultra.coach/api/webhooks/user-info?user_name=Kirby&session_id=test123"
```

Expected response:
```json
{
  "name": "Kirby",
  "session_id": "test123",
  "greeting": "Hello Kirby! Welcome to your coaching session.",
  "profile": {
    "coaching_style": "supportive",
    "previous_sessions": 0,
    "current_goals": ["stress_reduction", "better_sleep"],
    "preferred_topics": ["vagus_nerve", "breathing_exercises"]
  },
  "timestamp": "2025-01-23T..."
}
```

## 🔧 ElevenLabs Tool Configuration

### Step 1: Access ElevenLabs Dashboard
1. Go to [ElevenLabs Dashboard](https://elevenlabs.io)
2. Navigate to your agent: `agent_01jy88zv6zfe1a9v9zdxt69abd`
3. Go to **Tools** section
4. Click **"Add Tool"**

### Step 2: Configure the Webhook Tool

#### Basic Settings:
- **Name**: `get_user_info`
- **Description**: `Get information about the current user including their name, preferences, and coaching history to personalize the conversation.`
- **Method**: `GET`
- **URL**: `https://myultra.coach/api/webhooks/user-info`
- **Response timeout**: `20` seconds

#### Query Parameters:
Click **"Add param"** for each:

1. **Parameter 1:**
   - Name: `user_name`
   - Type: `string`
   - Description: `The user's name`
   - Required: ✅ Yes

2. **Parameter 2:**
   - Name: `session_id`
   - Type: `string`
   - Description: `Current session identifier`
   - Required: ❌ No

3. **Parameter 3:**
   - Name: `room_id`
   - Type: `string`
   - Description: `Current room identifier`
   - Required: ❌ No

#### Dynamic Variables:
Click **"Add dynamic variable"** for each:

1. **Variable 1:**
   - Name: `user_name`
   - Value: `{{user_name}}`

2. **Variable 2:**
   - Name: `session_id`
   - Value: `{{session_id}}`

3. **Variable 3:**
   - Name: `room_id`
   - Value: `{{room_id}}`

### Step 3: Test the Tool
1. Save the tool configuration
2. Test the agent in the ElevenLabs interface
3. The AI should be able to call this tool and get user information

## 🎯 How It Works

### 1. User Starts Conversation
When a user opens the coaching room:
```html
<elevenlabs-convai 
    agent-id="agent_01jy88zv6zfe1a9v9zdxt69abd"
    dynamic-variables='{"user_name": "Kirby", "session_id": "abc123", "room_id": "room456"}'
></elevenlabs-convai>
```

### 2. AI Calls Webhook
The AI can now use the `get_user_info` tool:
```
AI: "Let me get your information..."
Tool Call: GET https://myultra.coach/api/webhooks/user-info?user_name=Kirby&session_id=abc123&room_id=room456
```

### 3. Server Responds
Your server returns user data:
```json
{
  "name": "Kirby",
  "greeting": "Hello Kirby! Welcome to your coaching session.",
  "profile": {
    "coaching_style": "supportive",
    "current_goals": ["stress_reduction", "better_sleep"]
  }
}
```

### 4. AI Uses Information
The AI can now personalize the conversation:
```
AI: "Hello Kirby! Welcome to your coaching session. I see you're working on stress reduction and better sleep. How are you feeling today?"
```

## 🎨 Agent Prompt Examples

Add these to your agent's system prompt to utilize the webhook:

```
You are an AI coaching assistant. At the start of each conversation, use the get_user_info tool to retrieve the user's information and personalize your greeting and responses.

Example workflow:
1. Call get_user_info tool with the user's name
2. Use the returned information to:
   - Greet them by name
   - Reference their goals and preferences
   - Adapt your coaching style
   - Build on previous sessions

Always start with: "Let me get your information to personalize our session..."
```

## 🔍 Testing & Debugging

### Local Testing (Development):
```bash
# Start your dev server
npm run dev

# Test the endpoint
curl "http://localhost:3000/api/webhooks/user-info?user_name=Kirby"
```

### Production Testing:
```bash
# Test production endpoint
curl "https://myultra.coach/api/webhooks/user-info?user_name=Kirby"
```

### ElevenLabs Testing:
1. Go to your agent in ElevenLabs
2. Click **"Test"** or use the voice interface
3. Say something like: "Hello, I'm Kirby"
4. The AI should call the webhook and personalize its response

## 🚀 Next Steps

1. **Deploy**: Push your code to production
2. **Configure**: Set up the ElevenLabs tool using the steps above
3. **Test**: Verify the webhook is working
4. **Enhance**: Add more user data and conversation history

## 📝 Future Enhancements

- Store conversation summaries
- Track user progress over time
- Add coaching preferences
- Implement user profiles
- Add authentication headers
- Create POST webhooks for data collection

---

*This webhook enables the AI to know the user's name and provide personalized coaching experiences!*
