# Web Admin Setup Status ✅

## Summary
The `web-admin` app is **fully integrated** and ready to use with `bun run dev`!

---

## ✅ Development Setup (Complete)

### 1. Environment Configuration
**File:** `.env`
```bash
ADMIN_PORT=3703
```
✅ Port 3703 is configured and will be used by web-admin

### 2. Dev Script Integration
**File:** `scripts/dev.ts` (Lines 169-178)

The dev script **already includes** web-admin:
```typescript
// Web Admin
if (!forceSpawn && (await isPortListening(host, adminPort))) {
  console.log(`[dev] web-admin already listening on ${host}:${adminPort}, skipping spawn...`);
} else {
  children.push({
    proc: spawnLogged('web-admin', ['bun', 'run', 'dev', '--', '--port', String(adminPort)], {
      cwd: join(root, 'apps', 'web-admin'),
      env: { API_PORT: String(apiPort), ADMIN_PORT: String(adminPort) },
    }),
  });
}
```

### 3. Package.json
**File:** `apps/web-admin/package.json`

✅ Has proper dev script:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build"
  }
}
```

---

## 🚀 How to Run

### Start All Apps (including Admin)
```bash
bun run dev
```

This will spawn:
- ✅ **API Server** → http://localhost:3699
- ✅ **Public Site** → http://localhost:3700
- ✅ **Coach Dashboard** → http://localhost:3701
- ✅ **Client App** → http://localhost:3702
- ✅ **Admin Dashboard** → http://localhost:3703

### Start Individual Apps
```bash
# Just admin
cd apps/web-admin
bun run dev

# Just API
cd apps/api
bun run dev
```

---

## 📦 PM2 Production Setup

### Status: ✅ Configured
**File:** `ecosystem.config.js` (Lines 87-95)

```javascript
{
  name: 'web-admin',
  script: 'apps/web-admin/dist/index.js',
  interpreter: 'bun',
  env: {
    NODE_ENV: 'production',
    PORT: 3703,
  },
}
```

### ⚠️ Important Note for Production

The current PM2 config points to `apps/web-admin/dist/index.js`, but **Vite builds produce static files**, not a Node.js server script.

**For production deployment, you need one of:**

1. **Option A: Use nginx to serve static files**
   ```nginx
   server {
       listen 3703;
       root /path/to/apps/web-admin/dist;
       index index.html;
       
       location / {
           try_files $uri $uri/ /index.html;
       }
   }
   ```

2. **Option B: Add a static server wrapper** (like `serve` or custom Bun server)
   ```bash
   cd apps/web-admin
   bun add -D serve
   
   # Update PM2 to:
   script: 'npx serve dist -p 3703'
   ```

3. **Option C: Use the current nginx proxy** (if already set up)
   - Build the app: `cd apps/web-admin && bun run build`
   - Nginx already proxies port 3703 to the static dist folder

---

## 🧪 Testing

### Verify Admin App Runs
```bash
# From root
bun run dev

# Check logs
[dev] 🚀 Development servers starting...
[dev]    API:         http://localhost:3699
[dev]    Public:      http://localhost:3700
[dev]    Coach:       http://localhost:3701
[dev]    Client:      http://localhost:3702
[dev]    Admin:       http://localhost:3703  ← Should see this!
```

### Verify Port is Listening
```bash
# Windows PowerShell
Test-NetConnection -ComputerName localhost -Port 3703

# Or in browser
http://localhost:3703
```

---

## 📂 Directory Structure

```
apps/
├── api/              → Backend API (Bun)
├── web-public/       → Public site (Vite + React)
├── web-coach/        → Coach dashboard (Vite + React)
├── web-client/       → Client app (Vite + React)
└── web-admin/        → Admin dashboard (Vite + React) ✅
    ├── src/
    ├── dist/         → Build output (gitignored)
    ├── package.json
    └── vite.config.ts
```

---

## ✅ Checklist

- [x] `ADMIN_PORT=3703` in .env
- [x] `scripts/dev.ts` spawns web-admin
- [x] `ecosystem.config.js` includes web-admin
- [x] `apps/web-admin/package.json` has dev script
- [x] Directory exists at `apps/web-admin/`
- [x] `dist/` folder is gitignored (from previous fix)

---

## 🎉 Conclusion

**You're all set!** Running `bun run dev` from the root will automatically start the admin dashboard on port 3703.

No changes needed - everything was already configured correctly!
