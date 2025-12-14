# 🛠️ Local Development Setup

## Quick Start for Local Development

### 1. Environment Setup
Create a `.env.local` file in your project root with:

```bash
# Development mode settings
NODE_ENV=development
BYPASS_AUTH=true

# Local server settings  
PORT=3000
HOST=localhost

# Disable production features
MONITORING_ENABLED=false

# ElevenLabs settings
ELEVENLABS_AGENT_ID=agent_01jy88zv6zfe1a9v9zdxt69abd
```

### 2. Start Development Server
```bash
# Install dependencies (if not done)
npm install

# Copy environment file
cp .env .env.local
# Edit .env.local and add the development settings above

# Start development server
npm run dev
```

### 3. Test Authentication Bypass
- Visit: `http://localhost:3000/dashboard`
- You should see the dashboard WITHOUT needing to login
- The system will create a mock user: "Developer User"

### 4. Test AI Voice Agent Room
- Visit: `http://localhost:3000/room/create` 
- This will create a test room and redirect you to it
- You should see the room interface with AI voice agent

### 5. Database Setup (if needed)
```bash
# Generate Prisma client
npx prisma generate

# Run migrations (if you have a local DB)
npx prisma migrate dev

# Optional: Open Prisma Studio
npx prisma studio
```

## 🎯 Development Features

- **✅ Authentication Bypass**: No need to login via Skool
- **✅ Mock User**: Automatic "Developer User" account
- **✅ Hot Reload**: Changes reflect immediately
- **✅ Local Database**: Use local PostgreSQL if configured
- **✅ Debug Logging**: Enhanced console output

## 🚀 Ready for Development!

You can now modify the dashboard and room interface locally without deploying to the server each time.
