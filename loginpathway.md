# Login Pathway - Skool Bot Authentication System

## 🔐 Overview

The MyUltraCoach authentication system uses a **bot-mediated token exchange** where users authenticate through Skool DMs and receive time-limited access codes. This creates a secure bridge between Skool community membership and MyUltraCoach platform access.

## 🔄 Complete Authentication Flow

### Step 1: User Requests Access
1. **User Action**: Visits `https://myultra.coach/login`
2. **Page Display**: Shows instructions to DM "My Ultra Coach" on Skool
3. **User Action**: Sends DM with "ACCESS" or similar keyword
4. **Bot Response**: "I will have your link shortly. https://myultra.coach/login/vgs-8698630987"

### Step 2: Code Generation & Delivery
- **Bot generates unique code**: Format `vgs-{timestamp}{random}` (e.g., `vgs-1703123456789-abc123`)
- **Database entry created**: Stores code with expiration (30 minutes) and usage tracking
- **Link delivered**: `https://myultra.coach/login/vgs-8698630987`

### Step 3: Code Validation & Login
1. **User clicks link**: Browser navigates to `/login/vgs-{code}`
2. **Server validation**:
   - ✅ Code exists in database
   - ✅ Code hasn't been used
   - ✅ Code hasn't expired (30 minutes)
   - ✅ User hasn't exceeded daily limit (5 uses per 24 hours)
3. **Success**: Mark code as used, create session, redirect to dashboard
4. **Failure**: Show error with instructions to request new code

### Step 4: Session Management
- **Cookie Creation**: 30-day secure, httpOnly cookie
- **Device Binding**: Associate cookie with device/browser fingerprint
- **Access Tracking**: Log successful logins and device information

### Step 5: Ongoing Access
- **Subsequent visits**: Check cookie validity
- **Cookie expiration**: Show re-authentication instructions
- **Rate limiting**: Enforce 5 codes per 24-hour period per user

## 📊 Database Schema

### auth_codes Table
```sql
CREATE TABLE auth_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,           -- vgs-1703123456789-abc123
  skool_user_id VARCHAR(100) NOT NULL,        -- From Skool profile
  skool_username VARCHAR(100) NOT NULL,       -- Display name from Skool
  generated_at TIMESTAMP DEFAULT NOW(),       -- When code was created
  expires_at TIMESTAMP NOT NULL,              -- 30 minutes from generation
  used_at TIMESTAMP NULL,                     -- When code was consumed (NULL = unused)
  used_ip_address INET NULL,                  -- IP that used the code
  user_agent TEXT NULL,                       -- Browser info
  device_fingerprint VARCHAR(255) NULL,       -- Device identification
  is_active BOOLEAN DEFAULT TRUE              -- Can be disabled manually
);

-- Index for quick lookups
CREATE INDEX idx_auth_codes_code ON auth_codes(code);
CREATE INDEX idx_auth_codes_user_date ON auth_codes(skool_user_id, generated_at);
```

### user_sessions Table
```sql
CREATE TABLE user_sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) UNIQUE NOT NULL,    -- Secure random session ID
  skool_user_id VARCHAR(100) NOT NULL,        -- Links to auth_codes
  skool_username VARCHAR(100) NOT NULL,       -- For display purposes
  auth_code_used VARCHAR(50) NOT NULL,        -- Which code created this session
  created_at TIMESTAMP DEFAULT NOW(),         -- Session start time
  expires_at TIMESTAMP NOT NULL,              -- 30 days from creation
  last_active TIMESTAMP DEFAULT NOW(),        -- For activity tracking
  ip_address INET NOT NULL,                   -- Login IP
  user_agent TEXT NOT NULL,                   -- Browser info
  device_fingerprint VARCHAR(255) NOT NULL,   -- Device identification
  is_active BOOLEAN DEFAULT TRUE              -- Can be revoked
);

-- Indexes for session management
CREATE INDEX idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX idx_user_sessions_user ON user_sessions(skool_user_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
```

### rate_limiting Table
```sql
CREATE TABLE rate_limiting (
  id SERIAL PRIMARY KEY,
  skool_user_id VARCHAR(100) NOT NULL,
  request_date DATE NOT NULL,                 -- Which day (YYYY-MM-DD)
  request_count INTEGER DEFAULT 1,            -- How many codes requested today
  last_request_at TIMESTAMP DEFAULT NOW(),    -- Most recent request time
  UNIQUE(skool_user_id, request_date)
);

-- Index for rate limit checks
CREATE INDEX idx_rate_limiting_user_date ON rate_limiting(skool_user_id, request_date);
```

## 🔧 Implementation Components

### 1. Login Page Enhancements (`/src/views/login.ejs`)
**Current State**: Basic Google OAuth login page
**Required Updates**:
- Add Skool authentication instructions section
- Display code validation errors/success messages
- Handle `/login/{code}` URL parameter parsing
- Show rate limiting warnings
- Mobile-optimized for Skool app users

### 2. Authentication Routes (`/src/routes/auth.js`)
**New Routes Needed**:
```javascript
// GET /login - Main login page with instructions
// GET /login/:code - Code validation and login
// POST /auth/validate-code - AJAX code validation
// GET /auth/status - Check current authentication status
// POST /auth/logout - Session termination
```

### 3. Authentication Middleware (`/src/middlewares/authMiddleware.js`)
**Functions Required**:
- `validateAuthCode(code)` - Check code validity
- `createUserSession(userData)` - Generate secure session
- `checkRateLimit(userId)` - Enforce daily limits
- `requireAuth()` - Protect dashboard routes
- `generateDeviceFingerprint()` - Device identification

### 4. Database Services (`/src/services/authService.js`)
**Core Functions**:
```javascript
// Code management
generateAuthCode(skoolUserId, skoolUsername)
validateAuthCode(code, ipAddress, userAgent)
markCodeAsUsed(code, sessionData)

// Session management
createSession(userData, authCode)
validateSession(sessionId)
extendSession(sessionId)
revokeSession(sessionId)

// Rate limiting
checkDailyLimit(skoolUserId)
incrementRequestCount(skoolUserId)
resetDailyLimits() // Cleanup job

// Analytics
getAuthStats(dateRange)
getActiveSessionCount()
```

### 5. Bot Integration Updates (`/test-live-dm-bot.js`)
**Required Enhancements**:
- Generate unique codes instead of static links
- Store codes in database when sending DM responses
- Include code expiration time in response message
- Log all code generation events

## 🛡️ Security Features

### Rate Limiting Strategy
- **Daily Limit**: 5 authentication codes per 24-hour period
- **Cooldown Period**: Must wait until next day (UTC) to reset
- **IP Tracking**: Monitor for suspicious activity across IPs
- **Device Limiting**: Track unique devices per user

### Session Security
- **Secure Cookies**: httpOnly, secure, sameSite=strict
- **Device Binding**: Sessions tied to device fingerprints
- **IP Validation**: Optional IP address consistency checks
- **Session Rotation**: New session ID on each login

### Code Security
- **Cryptographic Randomness**: Secure random code generation
- **Short Lifespan**: 30-minute expiration window
- **Single Use**: Codes invalidated after first use
- **Database Cleanup**: Expired codes automatically purged

## 📱 User Experience Flow

### Desktop/Mobile Login
```
1. User visits myultra.coach/login
   ↓
2. Sees: "DM @MyUltraCoach on Skool with 'ACCESS'"
   ↓
3. Opens Skool app/website, sends DM
   ↓
4. Receives: "Click this link: myultra.coach/login/vgs-xyz123"
   ↓
5. Clicks link → Validates → Redirects to dashboard
   ↓
6. Cookie set for 30 days of access
```

### Error Handling
- **Expired Code**: "This link has expired. DM @MyUltraCoach for a new one."
- **Used Code**: "This link has already been used. Request a new one if needed."
- **Rate Limited**: "You've reached the daily limit (5). Try again tomorrow."
- **Invalid Code**: "Invalid access code. Please request a new one."

### Mobile Optimization
- **Deep Links**: Handle Skool → MyUltraCoach app switching
- **Touch-Friendly**: Large buttons and clear instructions
- **Offline Handling**: Graceful degradation for poor connections

## 🚀 Implementation Priority

### Phase 1: Core Authentication (Week 1) - ✅ COMPLETED
1. ✅ Database schema creation and migrations
2. ✅ Basic auth routes (`/login`, `/login/:code`)
3. ✅ Code validation and session creation logic
4. ✅ Enhanced login.ejs page with Skool instructions
5. ✅ Bot integration for code generation

**Status**: 🎉 **FULLY IMPLEMENTED**

**Files Created/Modified**:
- `prisma/schema.prisma` - Added AuthCode, UserSession, RateLimit models
- `src/services/authService.js` - Complete authentication service with code generation, validation, and session management
- `src/middlewares/skoolAuthMiddleware.js` - Authentication middleware for route protection
- `src/routes/auth.js` - Updated existing auth routes to include Skool authentication flow
- `src/views/login.ejs` - Enhanced with Skool-specific authentication UI
- `test-live-dm-bot.js` - Integrated unique code generation with user extraction

**Key Features Working**:
- ✅ Unique code generation per user request
- ✅ 30-minute code expiration
- ✅ One-time use code validation
- ✅ Rate limiting (5 codes per day per user)
- ✅ Device fingerprinting for session security
- ✅ 30-day persistent sessions
- ✅ Bot extracts username from conversation
- ✅ Comprehensive error handling and user feedback

### Phase 2: Security & Rate Limiting (Week 2)
1. ✅ Rate limiting implementation (5 per day)
2. ✅ Device fingerprinting and session binding
3. ✅ Secure cookie management
4. ✅ Session validation middleware
5. ✅ Error handling and user feedback

### Phase 3: Dashboard Integration (Week 3)
1. ✅ Protect dashboard routes with auth middleware
2. ✅ User session management in dashboard
3. ✅ Logout functionality
4. ✅ Session status indicators
5. ✅ Mobile-responsive design improvements

### Phase 4: Monitoring & Analytics (Week 4)
1. ✅ Authentication success/failure logging
2. ✅ Rate limiting monitoring dashboard
3. ✅ Session analytics and cleanup jobs
4. ✅ Suspicious activity detection
5. ✅ Admin override capabilities

## 📈 Success Metrics

### Authentication Performance
- **Code Generation**: < 5 seconds from DM to link delivery
- **Login Success Rate**: > 95% for valid codes
- **Session Duration**: Average 30-day retention
- **Mobile Compatibility**: Seamless Skool → MyUltraCoach transition

### Security Effectiveness
- **Zero** code reuse incidents
- **Zero** session hijacking attempts
- **Rate limiting** prevents abuse (max 5 codes/day)
- **Device binding** prevents session sharing

### User Experience
- **Single-click login** from Skool DM links
- **Clear error messages** for all failure cases
- **Mobile-first design** for Skool app users
- **30-day persistent access** without re-authentication

## 🔧 Environment Variables Required

```bash
# Authentication Configuration
AUTH_CODE_EXPIRY_MINUTES=30
SESSION_EXPIRY_DAYS=30
DAILY_CODE_LIMIT=5
ENABLE_DEVICE_BINDING=true
ENABLE_IP_VALIDATION=false

# Security Settings
SESSION_SECRET=32_char_random_string
COOKIE_SECRET=32_char_random_string
AUTH_ENCRYPTION_KEY=32_char_random_string

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/myultracoach

# Bot Integration
SKOOL_BOT_CALLBACK_URL=http://localhost:3000/api/bot/code-generated
```

This authentication system creates a **secure, user-friendly bridge** between Skool community membership and MyUltraCoach premium features while maintaining the simplicity users expect from modern web applications.
