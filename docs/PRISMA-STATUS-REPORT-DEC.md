# Prisma Database Status Report - December 2025

## Executive Summary

This project uses **Prisma 5.14.0** with **PostgreSQL** as the database provider. The database contains **11 models** covering user management, coaching sessions, appointments, Skool integration, and authentication. The schema is actively maintained with **12 migrations** applied since May 2025.

**Database:** `hybridcoach_dev` on PostgreSQL  
**Current Schema Version:** Latest migration `20251214082136_add_onboarding_fields`  
**Total Tables:** 11 models  
**Key Features:** Authentication, Session Management, Appointments, Ratings, Skool Integration, Onboarding

---

## Database Connection

### Environment Configuration
```bash
DATABASE_URL="postgresql://hybridcoach:PASSWORD@localhost:5432/hybridcoach_dev?schema=public"
```

### Prisma Client Initialization
**Location:** `src/lib/prisma.js`

```javascript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;
export const prisma = globalForPrisma.__prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.__prisma = prisma;
```

**Pattern:** Singleton with global caching (prevents hot-reload issues in development)

---

## Schema Overview

### 1. **User Model** (Core Identity)

**Purpose:** Central user account for coaches and clients

**Key Fields:**
- `id` (String, CUID) - Primary key
- `googleId` (String, Unique) - Google OAuth identifier
- `email` (String, Unique) - User email
- `displayName` (String) - User's full name
- `role` (String) - User role: "coach", "client", "admin"

**Skool Integration Fields:**
```typescript
skoolUltraEmail         String?    // Email in Ultra Skool community
skoolVagusEmail         String?    // Email in Vagus Skool community
ultraSubscriptionStatus String?    // active, cancelled, expired
vagusSubscriptionStatus String?    // active, cancelled, expired
lastSkoolSync           DateTime?  // Last Skool membership check
membershipEndDate       DateTime?  // Grace period expiration
membershipWarningShown  Boolean    // Has user been warned about expiration
```

**Profile Photo Fields:**
```typescript
skoolProfileUrl        String?    // Skool profile page URL
skoolProfilePhotoUrl   String?    // Original Skool photo URL
profilePhotoPath       String?    // Local file storage path
skoolBio              String?    // Member bio from Skool
skoolJoinedDate       DateTime?  // When they joined Skool
lastPhotoSync         DateTime?  // Last photo download timestamp
```

**Coach-Specific Fields:**
```typescript
isAvailable  Boolean  // Is coach available for bookings?
coachLevel   Int?     // Coach tier/level
coachName    String?  // Coach display name (if different)
```

**Relationships:**
- → `Profile` (1:1)
- → `Appointment[]` as coach or client (1:many)
- → `Session[]` (1:many)
- → `Message[]` (1:many)
- → `MembershipStatusHistory[]` (1:many)

**Indexes:**
- `@unique` on `googleId`, `email`

---

### 2. **Profile Model** (Extended User Data)

**Purpose:** Stores client preferences, context, and onboarding data

**Key Fields:**
- `id` (String, CUID) - Primary key
- `userId` (String, Unique) - Foreign key to User
- `bioJson` (Json?) - Structured bio data

**Client Context Fields (AI Enhancement):**
```typescript
clientFacts  String[]  @default([])  // Known facts about client
challenges   String[]  @default([])  // Client's challenges
preferences  Json?                   // Preferences (JSON object)
lastSummary  String?                 // Last session summary
contextNotes String?                 // Free-form notes
```

**Onboarding Fields (Recent Addition - Dec 14, 2025):**
```typescript
onboardingCompleted    Boolean   @default(false)  // Has client finished onboarding?
onboardingCompletedAt  DateTime?                  // When they completed it
intakeCoachingGoals    String?                    // What they hope to achieve
intakeSymptoms         String?                    // Health symptoms they experience
intakeInitialMood      Int?                       // 1-5 star mood rating at start
```

**Relationships:**
- → `User` (1:1 via `userId`)

**Indexes:**
- `@unique` on `userId`

**Usage Example:**
```javascript
// Upsert profile with onboarding data
await prisma.profile.upsert({
  where: { userId: user.id },
  update: {
    onboardingCompleted: true,
    intakeCoachingGoals: "Improve breathing and reduce anxiety",
    intakeSymptoms: "Shallow breathing, racing heart",
    intakeInitialMood: 3,
  },
  create: { userId: user.id, /* ... */ }
});
```

---

### 3. **Session Model** (Coaching Sessions)

**Purpose:** Tracks individual coaching room sessions

**Key Fields:**
- `id` (String, CUID) - Primary key
- `roomId` (String) - LiveKit room identifier
- `appointmentId` (String) - Foreign key to Appointment
- `userId` (String) - Foreign key to User (participant)
- `startedAt` (DateTime) - Session start time
- `endedAt` (DateTime?) - Session end time (null = active)

**Session Management Fields:**
```typescript
durationMinutes  Int     @default(20)     // Expected duration
status          String  @default("active") // active, completed, cancelled
warningsSent    Int     @default(0)       // Count of time warnings sent
transcript      String?                   // Full conversation transcript
aiSummary       String?                   // AI-generated summary
summary         String?                   // Manual/final summary
```

**Relationships:**
- → `User` (many:1 via `userId`)
- → `Appointment` (many:1 via `appointmentId`)
- → `Message[]` (1:many)
- → `SessionRating` (1:1)

**Indexes:**
- `@@unique([appointmentId, userId])` - Composite unique constraint

**Usage Pattern:**
```javascript
// Create session when participant joins room
const session = await prisma.session.create({
  data: {
    roomId,
    userId,
    appointmentId,
    durationMinutes: 20,
    status: 'active'
  }
});

// Update session with AI summary when complete
await prisma.session.update({
  where: { id: session.id },
  data: {
    endedAt: new Date(),
    status: 'completed',
    aiSummary: generatedSummary,
    transcript: fullTranscript
  }
});
```

---

### 4. **SessionRating Model** (Post-Session Feedback)

**Purpose:** Collects client ratings and tips after sessions

**Key Fields:**
- `id` (String, CUID) - Primary key
- `sessionId` (String, Unique) - Foreign key to Session
- `rating` (Int) - 1-5 star rating
- `comment` (String?) - Optional feedback text
- `tipAmount` (Float?) - Tip amount ($1, $3, or $5)
- `createdAt` (DateTime) - When rating was submitted

**Relationships:**
- → `Session` (1:1 via `sessionId`)

**Indexes:**
- `@unique` on `sessionId`

**Usage Example:**
```javascript
// Submit rating after session
await prisma.sessionRating.create({
  data: {
    sessionId: session.id,
    rating: 5,
    comment: "Very helpful session!",
    tipAmount: 5.00
  }
});
```

---

### 5. **Message Model** (In-Session Chat)

**Purpose:** Stores chat messages exchanged during sessions

**Key Fields:**
- `id` (String, CUID) - Primary key
- `sessionId` (String) - Foreign key to Session
- `userId` (String) - Foreign key to User (sender)
- `sender` (String) - Sender identifier (user/coach/ai)
- `content` (String) - Message text
- `createdAt` (DateTime) - Message timestamp

**Relationships:**
- → `Session` (many:1 via `sessionId`)
- → `User` (many:1 via `userId`)

**Usage Pattern:**
```javascript
// Store chat message
await prisma.message.create({
  data: {
    sessionId,
    userId,
    sender: 'client',
    content: 'Can we focus on breathing exercises?'
  }
});
```

---

### 6. **Appointment Model** (Scheduled Sessions)

**Purpose:** Manages scheduled coaching appointments

**Key Fields:**
- `id` (String, CUID) - Primary key
- `scheduledFor` (DateTime) - Appointment start time
- `durationMin` (Int) - Duration in minutes (default: 30)
- `clientId` (String) - Foreign key to User (client)
- `coachId` (String) - Foreign key to User (coach)
- `roomId` (String, Unique) - Associated LiveKit room
- `status` (String) - scheduled, active, completed, cancelled
- `cancelledAt` (DateTime?) - When cancelled
- `cancelledBy` (String?) - Who cancelled
- `createdAt` (DateTime) - Appointment creation time

**Relationships:**
- → `User` as client (many:1 via `clientId`)
- → `User` as coach (many:1 via `coachId`)
- → `Session[]` (1:many)

**Indexes:**
- `@unique` on `roomId`

**Usage Example:**
```javascript
// Create appointment
const appointment = await prisma.appointment.create({
  data: {
    scheduledFor: new Date('2025-12-15T10:00:00Z'),
    durationMin: 30,
    clientId: client.id,
    coachId: coach.id,
    roomId: `session-${crypto.randomUUID()}`,
    status: 'scheduled'
  }
});

// Cancel appointment
await prisma.appointment.update({
  where: { id: appointment.id },
  data: {
    status: 'cancelled',
    cancelledAt: new Date(),
    cancelledBy: userId
  }
});
```

---

### 7. **SkoolMonitoringLog Model** (Membership Sync History)

**Purpose:** Audit log for Skool membership synchronization

**Key Fields:**
- `id` (Int, AutoIncrement) - Primary key
- `community` (String) - "ultra" or "vagus"
- `membersFound` (Int) - Total members found
- `newMembers` (Int) - New members detected
- `cancelledMembers` (Int) - Cancelled memberships detected
- `syncDurationMs` (Int) - How long sync took
- `success` (Boolean) - Did sync complete successfully?
- `errorMessage` (String?) - Error details if failed
- `executedAt` (DateTime) - When sync ran

**Usage Pattern:**
```javascript
// Log Skool sync results
await prisma.skoolMonitoringLog.create({
  data: {
    community: 'ultra',
    membersFound: 42,
    newMembers: 3,
    cancelledMembers: 1,
    syncDurationMs: 5234,
    success: true,
    executedAt: new Date()
  }
});
```

---

### 8. **MembershipStatusHistory Model** (Status Change Tracking)

**Purpose:** Track changes in member subscription status over time

**Key Fields:**
- `id` (String, CUID) - Primary key
- `userId` (String) - Foreign key to User
- `community` (String) - "ultra" or "vagus"
- `previousStatus` (String?) - Status before change
- `newStatus` (String) - New status
- `changeDetectedAt` (DateTime) - When change was detected

**Relationships:**
- → `User` (many:1 via `userId`)

**Usage Example:**
```javascript
// Record status change
await prisma.membershipStatusHistory.create({
  data: {
    userId: user.id,
    community: 'ultra',
    previousStatus: 'active',
    newStatus: 'cancelled',
    changeDetectedAt: new Date()
  }
});
```

---

### 9. **AuthCode Model** (Skool-Based Authentication)

**Purpose:** Generate and validate authentication codes for Skool members

**Key Fields:**
- `id` (String, CUID) - Primary key
- `code` (String, Unique) - Auth code: `vgs-{timestamp}-{random}`
- `skoolUserId` (String) - Skool user identifier
- `skoolUsername` (String) - Display name from Skool
- `generatedAt` (DateTime) - When code was created
- `expiresAt` (DateTime) - Code expiration (30 minutes)
- `usedAt` (DateTime?) - When code was redeemed (null = unused)
- `usedIpAddress` (String?) - IP that used the code
- `userAgent` (String?) - Browser info
- `deviceFingerprint` (String?) - Device identification
- `isActive` (Boolean) - Is code still valid?

**Relationships:**
- → `UserSession[]` (1:many)

**Indexes:**
- `@unique` on `code`
- `@index` on `code` (query performance)
- `@index` on `[skoolUserId, generatedAt]` (user code history)

**Usage Pattern:**
```javascript
// Generate auth code
const code = `vgs-${Date.now()}-${randomString()}`;
const authCode = await prisma.authCode.create({
  data: {
    code,
    skoolUserId: profile.id,
    skoolUsername: profile.name,
    generatedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
    isActive: true
  }
});

// Consume code
await prisma.authCode.update({
  where: { code },
  data: {
    usedAt: new Date(),
    usedIpAddress: req.ip,
    userAgent: req.headers['user-agent'],
    isActive: false
  }
});
```

---

### 10. **UserSession Model** (Active Sessions)

**Purpose:** Track authenticated user sessions

**Key Fields:**
- `id` (String, CUID) - Primary key
- `sessionId` (String, Unique) - Session token
- `skoolUserId` (String) - Skool user identifier
- `skoolUsername` (String) - Display name
- `authCodeUsed` (String) - Foreign key to AuthCode
- `createdAt` (DateTime) - Session start
- `expiresAt` (DateTime) - Session expiration (30 days)
- `lastActive` (DateTime) - Last activity timestamp
- `ipAddress` (String) - Login IP
- `userAgent` (String) - Browser info
- `deviceFingerprint` (String) - Device identification
- `isActive` (Boolean) - Is session valid?

**Relationships:**
- → `AuthCode` (many:1 via `authCodeUsed`)

**Indexes:**
- `@unique` on `sessionId`
- `@index` on `sessionId` (query performance)
- `@index` on `skoolUserId` (user lookup)
- `@index` on `expiresAt` (cleanup queries)

**Usage Example:**
```javascript
// Create session after successful login
const session = await prisma.userSession.create({
  data: {
    sessionId: generateSecureToken(),
    skoolUserId: authCode.skoolUserId,
    skoolUsername: authCode.skoolUsername,
    authCodeUsed: authCode.code,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    deviceFingerprint: calculateFingerprint(req)
  }
});

// Validate session
const activeSession = await prisma.userSession.findUnique({
  where: { sessionId: token },
  select: {
    isActive: true,
    expiresAt: true,
    skoolUserId: true
  }
});

if (!activeSession?.isActive || activeSession.expiresAt < new Date()) {
  throw new Error('Session expired');
}
```

---

### 11. **RateLimit Model** (Auth Code Rate Limiting)

**Purpose:** Prevent abuse of authentication code generation

**Key Fields:**
- `id` (String, CUID) - Primary key
- `skoolUserId` (String) - User identifier
- `requestDate` (DateTime) - Date of requests (date only)
- `requestCount` (Int) - Number of codes requested today
- `lastRequestAt` (DateTime) - Most recent request time

**Indexes:**
- `@@unique([skoolUserId, requestDate])` - One record per user per day
- `@index` on `[skoolUserId, requestDate]` (query performance)

**Usage Example:**
```javascript
// Check and increment rate limit
const today = new Date();
today.setHours(0, 0, 0, 0);

const rateLimit = await prisma.rateLimit.upsert({
  where: {
    skoolUserId_requestDate: {
      skoolUserId: user.id,
      requestDate: today
    }
  },
  update: {
    requestCount: { increment: 1 },
    lastRequestAt: new Date()
  },
  create: {
    skoolUserId: user.id,
    requestDate: today,
    requestCount: 1,
    lastRequestAt: new Date()
  }
});

if (rateLimit.requestCount > 5) {
  throw new Error('Rate limit exceeded: max 5 codes per day');
}
```

---

## Database Relationships Diagram

```
User
  ├─→ Profile (1:1)
  ├─→ Appointment[] as client (1:many)
  ├─→ Appointment[] as coach (1:many)
  ├─→ Session[] (1:many)
  ├─→ Message[] (1:many)
  └─→ MembershipStatusHistory[] (1:many)

Appointment
  ├─→ User (client) (many:1)
  ├─→ User (coach) (many:1)
  └─→ Session[] (1:many)

Session
  ├─→ User (many:1)
  ├─→ Appointment (many:1)
  ├─→ Message[] (1:many)
  └─→ SessionRating (1:1)

AuthCode
  └─→ UserSession[] (1:many)

UserSession
  └─→ AuthCode (many:1)

(Standalone)
- SkoolMonitoringLog
- RateLimit
```

---

## Migration History

### Timeline of Schema Changes

| Date | Migration | Description |
|------|-----------|-------------|
| 2025-05-17 | `20250517205349_init` | Initial schema |
| 2025-05-17 | `20250517210139_init` | Schema refinement |
| 2025-05-17 | `20250517211535_add_session_summary` | Add session summary field |
| 2025-05-17 | `20250517212219_conversations` | Add conversation/message tracking |
| 2025-05-18 | `20250518184409_add_appointments` | Add appointment system |
| 2025-06-14 | `20250614002430_init` | Schema restructure |
| 2025-06-14 | `20250614020133_init` | Additional init changes |
| 2025-06-14 | `20250614021534_init` | Final init changes |
| 2025-06-15 | `20250615201012_init` | Init completion |
| 2025-06-18 | `20250618222156_add_client_context_and_session_management` | ✅ **Client context fields, session management** |
| 2025-06-19 | `20250619021646_add_skool_profile_photos` | ✅ **Skool profile photo integration** |
| 2025-12-14 | `20251214082136_add_onboarding_fields` | ✅ **Onboarding system + Auth codes** |

### Latest Migration (Dec 14, 2025)

**Changes:**
1. Added `Profile` onboarding fields:
   - `onboardingCompleted` (Boolean)
   - `onboardingCompletedAt` (DateTime)
   - `intakeCoachingGoals` (String)
   - `intakeSymptoms` (String)
   - `intakeInitialMood` (Int)

2. Created `AuthCode` table (Skool auth system)
3. Created `UserSession` table (session management)
4. Created `RateLimit` table (abuse prevention)

---

## Key Patterns & Usage

### 1. User Role Determination

**Logic:** `src/services/userService.js` - `determineUserRole()`

```javascript
function determineUserRole(user) {
  const now = new Date();
  
  // Priority 1: Active Ultra Skool membership → coach
  if (user.ultraSubscriptionStatus === 'active') return 'coach';
  
  // Priority 2: Cancelled Ultra but still in grace period → coach
  if (user.ultraSubscriptionStatus === 'cancelled' && 
      user.membershipEndDate && 
      user.membershipEndDate > now) {
    return 'coach';
  }
  
  // Priority 3: Active Vagus Skool membership → client
  if (user.vagusSubscriptionStatus === 'active') return 'client';
  
  // Fallback: Default to client
  return 'client';
}
```

### 2. Session Lifecycle

**States:** `active` → `completed` / `cancelled`

```javascript
// 1. Create session on room join
const session = await prisma.session.create({
  data: {
    roomId,
    userId,
    appointmentId,
    status: 'active',
    durationMinutes: 20
  }
});

// 2. Track warnings sent
await prisma.session.update({
  where: { id: session.id },
  data: { warningsSent: { increment: 1 } }
});

// 3. Complete session
await prisma.session.update({
  where: { id: session.id },
  data: {
    endedAt: new Date(),
    status: 'completed',
    transcript: fullTranscript,
    aiSummary: generatedSummary
  }
});
```

### 3. Onboarding Flow

**Route:** `apps/api/src/routes/onboarding.ts`

```javascript
// Check onboarding status
const profile = await prisma.profile.findUnique({
  where: { userId: user.id },
  select: { onboardingCompleted: true }
});

if (!profile?.onboardingCompleted) {
  // Redirect to onboarding
}

// Complete onboarding
await prisma.profile.upsert({
  where: { userId: user.id },
  update: {
    onboardingCompleted: true,
    onboardingCompletedAt: new Date(),
    intakeCoachingGoals: goals,
    intakeSymptoms: symptoms,
    intakeInitialMood: mood
  },
  create: { userId: user.id, /* ... */ }
});
```

### 4. Client Context Building (AI Enhancement)

**Purpose:** Accumulate facts about clients for AI personalization

```javascript
// Add client fact
await prisma.profile.update({
  where: { userId: clientId },
  data: {
    clientFacts: {
      push: "Prefers morning sessions"
    }
  }
});

// Add challenge
await prisma.profile.update({
  where: { userId: clientId },
  data: {
    challenges: {
      push: "Struggles with consistent breathing practice"
    }
  }
});

// Get context for AI
const profile = await prisma.profile.findUnique({
  where: { userId: clientId },
  select: {
    clientFacts: true,
    challenges: true,
    preferences: true,
    lastSummary: true,
    intakeCoachingGoals: true,
    intakeSymptoms: true
  }
});

// Inject into AI prompt
const context = `
Client Facts: ${profile.clientFacts.join(', ')}
Challenges: ${profile.challenges.join(', ')}
Goals: ${profile.intakeCoachingGoals}
Symptoms: ${profile.intakeSymptoms}
`;
```

---

## Prisma Scripts

### Package.json Scripts

```json
{
  "scripts": {
    "migrate": "prisma migrate dev --name init",
    "generate": "prisma generate",
    "check-db": "node scripts/check-database.js"
  }
}
```

### Generate Prisma Client

```bash
bun run generate
# or
npx prisma generate
```

### Create Migration

```bash
bun run migrate
# or
npx prisma migrate dev --name your_migration_name
```

### View Database in Prisma Studio

```bash
npx prisma studio
```

Opens web UI at `http://localhost:5555` to browse data.

---

## Current Data Utilization

### Where Prisma is Used

**API Routes (Bun/TypeScript):**
- `apps/api/src/routes/onboarding.ts` - Onboarding system

**Legacy Routes (Node.js):**
- `src/routes/api.js` - Main API router
- `src/routes/coach.js` - Coach-specific routes
- `src/routes/client.js` - Client-specific routes
- `src/routes/schedule.js` - Appointment scheduling
- `src/routes/room.js` - Session room management
- `src/routes/ai.js` - AI service integration
- `src/routes/api/profile.js` - Profile management
- `src/routes/api/message.js` - Message handling
- `src/routes/api/coach.js` - Coach operations

**Services:**
- `src/services/userService.js` - User CRUD operations
- `src/services/authService.js` - Authentication logic
- `src/services/sessionTimer.js` - Session time tracking
- `src/services/SessionSummaryHandler.js` - AI summaries
- `src/services/aiService.js` - AI context building
- `src/services/skoolMonitoringService.js` - Skool sync

**Controllers:**
- `src/controllers/dashboardController.js` - Dashboard data
- `src/controllers/sessionRatingController.js` - Ratings

**Middleware:**
- `src/middlewares/jwtAuth.js` - JWT validation

**Utilities:**
- `src/utils/sessionUtils.js` - Session helpers
- `scripts/check-database.js` - DB health check

---

## Recommendations for Expansion

### 1. Add Coach Availability System

**Goal:** Track coach availability slots for better scheduling

```prisma
model CoachAvailability {
  id          String   @id @default(cuid())
  coachId     String
  dayOfWeek   Int      // 0 = Sunday, 6 = Saturday
  startTime   String   // "09:00"
  endTime     String   // "17:00"
  isRecurring Boolean  @default(true)
  specificDate DateTime? // For one-off availability
  coach       User     @relation(fields: [coachId], references: [id])
  
  @@index([coachId, dayOfWeek])
}
```

### 2. Add Session Tags/Topics

**Goal:** Categorize sessions by topic for analytics

```prisma
model SessionTopic {
  id          String   @id @default(cuid())
  name        String   @unique // "breathing", "anxiety", "stress"
  description String?
  sessions    SessionTopicMapping[]
}

model SessionTopicMapping {
  id        String   @id @default(cuid())
  sessionId String
  topicId   String
  session   Session  @relation(fields: [sessionId], references: [id])
  topic     SessionTopic @relation(fields: [topicId], references: [id])
  
  @@unique([sessionId, topicId])
}
```

### 3. Add Coach-Client Notes

**Goal:** Private notes coaches can add about clients

```prisma
model ClientNote {
  id        String   @id @default(cuid())
  coachId   String
  clientId  String
  content   String
  isPrivate Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  coach     User     @relation("CoachNotes", fields: [coachId], references: [id])
  client    User     @relation("ClientNotes", fields: [clientId], references: [id])
  
  @@index([coachId, clientId])
}
```

### 4. Add Payment/Billing Tracking

**Goal:** Track tips and potential future payments

```prisma
model Payment {
  id            String   @id @default(cuid())
  userId        String   // Who paid
  coachId       String?  // If tip to coach
  sessionId     String?  // Associated session
  amount        Float
  currency      String   @default("USD")
  type          String   // "tip", "subscription", "one_time"
  status        String   // "pending", "completed", "refunded"
  stripePaymentId String? @unique
  createdAt     DateTime @default(now())
  user          User     @relation("Payments", fields: [userId], references: [id])
  coach         User?    @relation("ReceivedPayments", fields: [coachId], references: [id])
  session       Session? @relation(fields: [sessionId], references: [id])
  
  @@index([userId, createdAt])
  @@index([coachId, createdAt])
}
```

### 5. Add Goal Tracking

**Goal:** Track client goals and progress over time

```prisma
model ClientGoal {
  id          String   @id @default(cuid())
  clientId    String
  title       String
  description String?
  targetDate  DateTime?
  status      String   @default("active") // active, achieved, abandoned
  createdAt   DateTime @default(now())
  achievedAt  DateTime?
  client      User     @relation(fields: [clientId], references: [id])
  progress    GoalProgress[]
  
  @@index([clientId, status])
}

model GoalProgress {
  id        String   @id @default(cuid())
  goalId    String
  note      String
  rating    Int      // 1-5 how close to goal
  createdAt DateTime @default(now())
  goal      ClientGoal @relation(fields: [goalId], references: [id])
  
  @@index([goalId, createdAt])
}
```

### 6. Add Notification System

**Goal:** Track and manage user notifications

```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String   // "appointment_reminder", "membership_expiring", etc.
  title     String
  message   String
  isRead    Boolean  @default(false)
  actionUrl String?
  createdAt DateTime @default(now())
  readAt    DateTime?
  user      User     @relation(fields: [userId], references: [id])
  
  @@index([userId, isRead, createdAt])
}
```

### 7. Add Exercise/Resource Library

**Goal:** Store breathing exercises and resources coaches can assign

```prisma
model Exercise {
  id          String   @id @default(cuid())
  title       String
  description String
  category    String   // "breathing", "meditation", "physical"
  duration    Int      // Duration in seconds
  difficulty  String   // "beginner", "intermediate", "advanced"
  videoUrl    String?
  audioUrl    String?
  instructions String
  createdBy   String   // Coach ID
  createdAt   DateTime @default(now())
  coach       User     @relation(fields: [createdBy], references: [id])
  assignments ExerciseAssignment[]
  
  @@index([category, difficulty])
}

model ExerciseAssignment {
  id         String   @id @default(cuid())
  exerciseId String
  clientId   String
  coachId    String
  dueDate    DateTime?
  completed  Boolean  @default(false)
  completedAt DateTime?
  createdAt  DateTime @default(now())
  exercise   Exercise @relation(fields: [exerciseId], references: [id])
  client     User     @relation("AssignedExercises", fields: [clientId], references: [id])
  coach      User     @relation("CoachAssignments", fields: [coachId], references: [id])
  
  @@index([clientId, completed])
  @@index([coachId, createdAt])
}
```

### 8. Add Analytics/Metrics Tracking

**Goal:** Track platform usage and performance metrics

```prisma
model PlatformMetric {
  id        String   @id @default(cuid())
  date      DateTime // Date bucket (day)
  metric    String   // "active_users", "sessions_completed", "avg_rating"
  value     Float
  metadata  Json?    // Additional context
  
  @@unique([date, metric])
  @@index([metric, date])
}
```

---

## Index Strategy Analysis

### Current Indexes

**Good:**
- ✅ Unique constraints on primary identifiers (email, googleId, code, sessionId, roomId)
- ✅ Composite unique on `Session` (appointmentId, userId)
- ✅ Composite unique on `RateLimit` (skoolUserId, requestDate)
- ✅ Indexed foreign keys for joins (AuthCode → UserSession)
- ✅ Query-optimized indexes on AuthCode.code, UserSession.sessionId

**Missing (Potential Performance Issues):**
- ⚠️ No index on `Appointment.status` (common filter)
- ⚠️ No index on `Session.status` (common filter)
- ⚠️ No index on `User.role` (common filter)
- ⚠️ No composite index on `Session.[userId, status]` (dashboard queries)
- ⚠️ No index on `Message.createdAt` (for ordering)

### Recommended Index Additions

```prisma
model User {
  // ...
  @@index([role])
  @@index([isAvailable]) // For coach availability queries
}

model Appointment {
  // ...
  @@index([status, scheduledFor])
  @@index([coachId, status])
  @@index([clientId, scheduledFor])
}

model Session {
  // ...
  @@index([userId, status])
  @@index([status, startedAt])
}

model Message {
  // ...
  @@index([sessionId, createdAt])
}

model Profile {
  // ...
  @@index([onboardingCompleted])
}
```

---

## Performance Considerations

### Query Optimization Tips

**1. Use `select` to fetch only needed fields:**
```javascript
// Bad: Fetches everything
const user = await prisma.user.findUnique({ where: { id } });

// Good: Selective fields
const user = await prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true, role: true }
});
```

**2. Use `include` carefully (can cause N+1 queries):**
```javascript
// Bad: Fetches all relations
const user = await prisma.user.findUnique({
  where: { id },
  include: { profile: true, sessions: true, appointments: true }
});

// Good: Fetch only what's needed
const user = await prisma.user.findUnique({
  where: { id },
  include: {
    profile: {
      select: { onboardingCompleted: true }
    }
  }
});
```

**3. Batch operations for bulk updates:**
```javascript
// Bad: Multiple queries
for (const userId of userIds) {
  await prisma.user.update({
    where: { id: userId },
    data: { isAvailable: false }
  });
}

// Good: Single batch update
await prisma.user.updateMany({
  where: { id: { in: userIds } },
  data: { isAvailable: false }
});
```

**4. Use transactions for atomic operations:**
```javascript
// Ensure appointment and session creation are atomic
await prisma.$transaction([
  prisma.appointment.create({ data: appointmentData }),
  prisma.session.create({ data: sessionData })
]);
```

---

## Security Considerations

### Current Security Measures

**✅ Strong:**
- CUID primary keys (not sequential, harder to guess)
- Unique constraints on sensitive fields (email, code)
- Foreign key constraints prevent orphaned records
- Timestamp tracking (createdAt, usedAt) for audit trails

**⚠️ Needs Attention:**
- No field-level encryption on sensitive data (bioJson, contextNotes)
- No cascade delete rules defined (orphaned records possible)
- No row-level security (relies on application logic)

### Recommended Security Additions

```prisma
// Add cascade delete rules
model Profile {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Session {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  appointment Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
}

// Add soft delete for audit compliance
model User {
  deletedAt DateTime?
  @@index([deletedAt])
}

model Session {
  deletedAt DateTime?
  @@index([deletedAt])
}
```

---

## Data Integrity Checks

### Required Constraints

**Missing Foreign Key Validations:**
- Session.userId → User.id ✅ (exists)
- Appointment.clientId → User.id ✅ (exists)
- Appointment.coachId → User.id ✅ (exists)
- Message.userId → User.id ✅ (exists)
- UserSession.authCodeUsed → AuthCode.code ✅ (exists)

**Potential Issues:**
- ⚠️ No check constraint on `SessionRating.rating` (should be 1-5)
- ⚠️ No check constraint on `Appointment.durationMin` (should be > 0)
- ⚠️ No check constraint on `Session.durationMinutes` (should be > 0)

### Recommended Constraints

```prisma
model SessionRating {
  rating Int @db.Integer // Add: CHECK (rating >= 1 AND rating <= 5)
}

model Appointment {
  durationMin Int @db.Integer // Add: CHECK (durationMin > 0)
}

model Session {
  durationMinutes Int @db.Integer // Add: CHECK (durationMinutes > 0)
}
```

**Note:** Prisma doesn't natively support CHECK constraints in schema. Add via raw SQL:

```sql
ALTER TABLE "SessionRating" 
ADD CONSTRAINT rating_range CHECK (rating >= 1 AND rating <= 5);

ALTER TABLE "Appointment" 
ADD CONSTRAINT duration_positive CHECK ("durationMin" > 0);

ALTER TABLE "Session" 
ADD CONSTRAINT session_duration_positive CHECK ("durationMinutes" > 0);
```

---

## Backup & Maintenance

### Recommended Backup Strategy

**1. Daily Automated Backups:**
```bash
# Cron job for daily backups
0 2 * * * pg_dump hybridcoach_dev > /backups/hybridcoach_$(date +\%Y\%m\%d).sql
```

**2. Pre-Migration Backups:**
```bash
# Before running migrations
npx prisma db push --skip-generate
pg_dump hybridcoach_dev > backup_before_migration.sql
npx prisma migrate deploy
```

**3. Critical Data Exports:**
```javascript
// Export user data periodically
const users = await prisma.user.findMany({
  include: { profile: true }
});

fs.writeFileSync('user_export.json', JSON.stringify(users, null, 2));
```

### Maintenance Tasks

**1. Clean up expired sessions:**
```javascript
// Run daily
await prisma.userSession.deleteMany({
  where: {
    expiresAt: { lt: new Date() },
    isActive: false
  }
});
```

**2. Clean up expired auth codes:**
```javascript
// Run hourly
await prisma.authCode.deleteMany({
  where: {
    expiresAt: { lt: new Date() },
    usedAt: { not: null }
  }
});
```

**3. Archive old sessions:**
```javascript
// Move sessions older than 6 months to archive table
const sixMonthsAgo = new Date();
sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

await prisma.$transaction([
  prisma.$executeRaw`
    INSERT INTO "SessionArchive" 
    SELECT * FROM "Session" 
    WHERE "endedAt" < ${sixMonthsAgo}
  `,
  prisma.session.deleteMany({
    where: { endedAt: { lt: sixMonthsAgo } }
  })
]);
```

---

## Summary

### Current State: ✅ Solid Foundation

**Strengths:**
- Well-structured schema with clear relationships
- Recent additions (onboarding, auth system) are well-designed
- Good use of JSON fields for flexible data (preferences, bioJson)
- Proper indexing on high-traffic queries
- Active development (12 migrations in 7 months)

**Areas for Improvement:**
- Add missing indexes for performance (status fields, date ranges)
- Implement cascade delete rules for data integrity
- Add check constraints for data validation
- Consider field-level encryption for sensitive data
- Set up automated backup strategy
- Add analytics/metrics tracking

**Expansion Priority:**
1. **High Priority:** Add indexes, cascade deletes, maintenance scripts
2. **Medium Priority:** Coach availability, session topics, client notes
3. **Low Priority:** Payment tracking, exercise library, analytics

**Next Steps:**
1. Run index optimization migration
2. Set up daily backup cron job
3. Implement session cleanup script
4. Plan and execute coach availability feature

---

**Report Generated:** December 2025  
**Schema Version:** v1.0 (Migration: 20251214082136_add_onboarding_fields)  
**Database:** PostgreSQL (localhost:5432/hybridcoach_dev)  
**Prisma Version:** 5.14.0
