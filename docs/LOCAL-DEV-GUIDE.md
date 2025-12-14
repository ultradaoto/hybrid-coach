# 🚀 Local Development Guide - MyUltra.Coach

## ✅ Current Setup Status
- **Server Running**: Port 3000
- **Auto-reload**: Enabled with nodemon
- **Authentication**: BYPASSED for development
- **Environment**: Development mode

## 🌐 Access Your Application

### Main Pages:
1. **Dashboard**: http://localhost:3000/dashboard
   - You should see the "🎤 Join Room with My Ultra Coach" button
   - Click it to create and join a room

2. **Direct Room Access**: http://localhost:3000/room/create
   - Creates a new room and redirects you to it
   - You'll see your video + AI Coach widget

3. **Home Page**: http://localhost:3000
   - Landing page

## 🛠️ Development Workflow

### The server is already running with:
```bash
npm run dev
```

### What this gives you:
- ✅ **Auto-reload**: Change any file and the server restarts automatically
- ✅ **No login required**: BYPASS_AUTH=true skips Skool authentication
- ✅ **Mock user**: You're automatically logged in as "Developer User"
- ✅ **All features**: Dashboard, rooms, AI voice agent all work

## 📝 Making Changes

1. **Edit any file** in your IDE
2. **Save the file**
3. **Server auto-restarts** (watch the terminal)
4. **Refresh browser** to see changes

### Key Files to Edit:
- `src/views/dashboard.ejs` - Dashboard UI
- `src/views/room-client.ejs` - Room interface
- `src/routes/room.js` - Room logic
- `src/controllers/dashboardController.js` - Dashboard logic

## 🎯 Testing the Complete Flow

1. Go to: http://localhost:3000/dashboard
2. Click: "🎤 Join Room with My Ultra Coach"
3. You'll be redirected to: `/room/{unique-id}`
4. You should see:
   - Your video (left)
   - Coach placeholder (center) - "Feature Coming Soon"
   - AI Voice Agent (right) - ElevenLabs widget
5. Click on the AI widget to start speaking!

## 🔧 Troubleshooting

### If server crashes:
```bash
# The server should auto-restart, but if not:
npm run dev
```

### If port 3000 is busy:
```bash
# Find what's using it:
netstat -ano | findstr :3000

# Kill the process (replace PID with the number):
taskkill /F /PID [PID]

# Restart:
npm run dev
```

### To see server logs:
The terminal where you ran `npm run dev` shows all logs in real-time.

## 🎨 Current Features Working

✅ **Dashboard** - Displays with hero section
✅ **Room Creation** - `/room/create` works
✅ **AI Voice Agent** - ElevenLabs widget loads
✅ **User Video** - Camera access works
✅ **Coach Placeholder** - Shows "Coming Soon"
✅ **Auto-reload** - Code changes reflect immediately

## 📊 Environment Variables (Already Set)
```
NODE_ENV=development
BYPASS_AUTH=true
PORT=3000
ELEVENLABS_AGENT_ID=agent_01jy88zv6zfe1a9v9zdxt69abd
```

---

**🎉 You're all set for local development!**

The server is running, auto-reload is active, and you can make changes without restarting anything!
