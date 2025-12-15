# Database V2.0 Deployment Guide

## Summary

This guide covers deploying the enhanced database schema with long-term client data management features.

## What's New

### 6 New Tables Added:
1. **SessionInsight** - AI-generated analysis after each session
2. **ClientObservation** - Cross-session pattern detection
3. **ClientGoal** - Progress tracking for client goals
4. **ClientSummary** - Weekly/monthly aggregated insights
5. **ArchivedTranscript** - Long-term transcript storage
6. **DataDeletionRequest** - GDPR compliance system

### Enhanced Existing Tables:
- **User**: Added data lifecycle fields and new relations
- **Profile**: Added accumulated insights and privacy settings
- **Session**: Added archival fields and insight relation

### New Indexes:
- Performance indexes on frequently queried fields
- Composite indexes for complex queries

---

## Deployment Steps

### 1. Verify Database Connection

First, ensure your PostgreSQL database is running:

```bash
# Check if PostgreSQL is running
# Windows (PowerShell):
Get-Service -Name postgresql*

# If not running, start it:
Start-Service postgresql-x64-16  # or your version
```

Verify connection string in `.env`:
```bash
DATABASE_URL="postgresql://hybridcoach:PASSWORD@localhost:5432/hybridcoach_dev?schema=public"
```

Test connection:
```bash
psql -U hybridcoach -d hybridcoach_dev -h localhost
```

### 2. Backup Current Database

**CRITICAL:** Backup before migration!

```bash
# Create backup
pg_dump -U hybridcoach -d hybridcoach_dev > backup_before_v2_$(date +%Y%m%d_%H%M%S).sql

# Or on Windows:
pg_dump -U hybridcoach -d hybridcoach_dev > backup_before_v2.sql
```

### 3. Apply Migration

```bash
# Navigate to project root
cd C:/Users/ultra/Documents/Websites/MyUltraCoach

# Generate Prisma client (already done)
npx prisma generate

# Create and apply migration
npx prisma migrate dev --name add_long_term_client_data_v2
```

If migration succeeds, you'll see:
```
✔ Generated Prisma Client
✔ Database Migration: migration completed
```

### 4. Verify Schema

Check that new tables exist:
```bash
# Connect to database
psql -U hybridcoach -d hybridcoach_dev

# List tables
\dt

# Should see:
# - SessionInsight
# - ClientObservation
# - ClientGoal
# - ClientSummary
# - ArchivedTranscript
# - DataDeletionRequest
```

### 5. Update Application Code

The Prisma client is already generated, so TypeScript types are available immediately.

---

## Troubleshooting

### Issue: "Authentication failed"

**Solution:** Check database credentials

```bash
# Verify .env file
cat .env | grep DATABASE_URL

# Test connection manually
psql -U hybridcoach -d hybridcoach_dev -h localhost

# If password is wrong, update .env
```

### Issue: "Database does not exist"

**Solution:** Create the database

```bash
# Connect as postgres superuser
psql -U postgres

# Create database
CREATE DATABASE hybridcoach_dev;

# Create user (if needed)
CREATE USER hybridcoach WITH PASSWORD 'your_password';

# Grant permissions
GRANT ALL PRIVILEGES ON DATABASE hybridcoach_dev TO hybridcoach;
```

### Issue: "Migration failed" 

**Solution:** Check for conflicting data

```bash
# Check if any tables have data conflicts
# Connect to database
psql -U hybridcoach -d hybridcoach_dev

# Check for issues
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```

If data conflicts exist:
1. Backup data from conflicting tables
2. Drop conflicting tables
3. Re-run migration
4. Restore data

### Issue: Migration Creates Duplicate Relations

**Solution:** Reset migration state

```bash
# WARNING: This will lose migration history
npx prisma migrate reset

# Then re-run
npx prisma migrate dev --name add_long_term_client_data_v2
```

---

## Rollback Procedure

If something goes wrong:

### 1. Restore from Backup

```bash
# Drop current database
dropdb -U hybridcoach hybridcoach_dev

# Recreate
createdb -U hybridcoach hybridcoach_dev

# Restore backup
psql -U hybridcoach -d hybridcoach_dev < backup_before_v2.sql
```

### 2. Restore Old Schema

```bash
# Copy backup schema
cp prisma/schema.prisma.backup prisma/schema.prisma

# Regenerate client
npx prisma generate
```

---

## Post-Deployment Verification

### 1. Check All Relations

```typescript
// Test script: scripts/verify-db.ts
import { prisma } from '../src/lib/prisma';

async function verify() {
  // Test new models exist
  const insightCount = await prisma.sessionInsight.count();
  const observationCount = await prisma.clientObservation.count();
  const goalCount = await prisma.clientGoal.count();
  const summaryCount = await prisma.clientSummary.count();
  const archiveCount = await prisma.archivedTranscript.count();
  const deletionCount = await prisma.dataDeletionRequest.count();
  
  console.log('✅ Database V2 Schema Verified');
  console.log(`SessionInsight: ${insightCount}`);
  console.log(`ClientObservation: ${observationCount}`);
  console.log(`ClientGoal: ${goalCount}`);
  console.log(`ClientSummary: ${summaryCount}`);
  console.log(`ArchivedTranscript: ${archiveCount}`);
  console.log(`DataDeletionRequest: ${deletionCount}`);
  
  // Test relations
  const user = await prisma.user.findFirst({
    include: {
      sessionInsights: true,
      clientObservations: true,
      clientGoals: true,
      clientSummaries: true,
    },
  });
  
  console.log('✅ Relations working correctly');
}

verify().catch(console.error);
```

Run verification:
```bash
npx tsx scripts/verify-db.ts
```

### 2. Test Existing Data

Ensure existing data is intact:

```typescript
// Test existing models still work
const sessions = await prisma.session.count();
const users = await prisma.user.count();
const appointments = await prisma.appointment.count();

console.log(`Sessions: ${sessions}`);
console.log(`Users: ${users}`);
console.log(`Appointments: ${appointments}`);
```

---

## Next Steps After Deployment

### 1. Seed Initial Goals from Onboarding

Extract goals from existing profiles:

```typescript
// scripts/seed-goals-from-onboarding.ts
import { prisma } from '../src/lib/prisma';

async function seedGoals() {
  const profiles = await prisma.profile.findMany({
    where: {
      onboardingCompleted: true,
      intakeCoachingGoals: { not: null },
    },
    include: { user: true },
  });
  
  for (const profile of profiles) {
    if (!profile.intakeCoachingGoals) continue;
    
    // Create initial goal from onboarding
    await prisma.clientGoal.create({
      data: {
        userId: profile.userId,
        goalText: profile.intakeCoachingGoals,
        category: 'wellness',
        status: 'active',
        source: 'onboarding',
        currentProgress: 0,
      },
    });
    
    console.log(`✅ Created goal for user ${profile.user.email}`);
  }
  
  console.log(`✅ Seeded ${profiles.length} goals from onboarding`);
}

seedGoals().catch(console.error);
```

Run seeding:
```bash
npx tsx scripts/seed-goals-from-onboarding.ts
```

### 2. Generate Retroactive Session Insights

For existing completed sessions:

```typescript
// scripts/generate-retroactive-insights.ts
import { prisma } from '../src/lib/prisma';

async function generateRetroactiveInsights() {
  const sessions = await prisma.session.findMany({
    where: {
      status: 'completed',
      insight: null, // No insight yet
      transcript: { not: null }, // Has transcript
    },
    take: 10, // Start with 10
  });
  
  for (const session of sessions) {
    // TODO: Call AI service to generate insight from transcript
    console.log(`Generating insight for session ${session.id}`);
    
    await prisma.sessionInsight.create({
      data: {
        sessionId: session.id,
        userId: session.userId,
        summary: `Session completed on ${session.startedAt.toISOString()}`,
        keyTopics: ['general_wellness'],
        modelVersion: 'retroactive_v1',
      },
    });
  }
  
  console.log(`✅ Generated ${sessions.length} retroactive insights`);
}

generateRetroactiveInsights().catch(console.error);
```

---

## Schema Changes Summary

### User Model
```diff
+ dataRetentionConsent    Boolean   @default(true)
+ lastDataExportAt        DateTime?
+ accountDeletionRequestedAt DateTime?
+ createdAt               DateTime  @default(now())
+ updatedAt               DateTime  @updatedAt
+ sessionInsights         SessionInsight[]
+ clientObservations      ClientObservation[]
+ clientGoals             ClientGoal[]
+ clientSummaries         ClientSummary[]
+ archivedTranscripts     ArchivedTranscript[]
+ dataDeletionRequests    DataDeletionRequest[]
```

### Profile Model
```diff
+ accumulatedInsights     String?   @db.Text
+ lastContextUpdateAt     DateTime?
+ contextVersion          Int       @default(0)
+ allowDataAggregation    Boolean   @default(true)
+ allowAnonymizedResearch Boolean   @default(false)
+ createdAt               DateTime  @default(now())
+ updatedAt               DateTime  @updatedAt
```

### Session Model
```diff
+ isArchived              Boolean   @default(false)
+ archivedAt              DateTime?
+ insight                 SessionInsight?
```

---

## Production Deployment Checklist

- [ ] Database backup created
- [ ] Database connection verified
- [ ] Migration applied successfully
- [ ] New tables created and accessible
- [ ] Existing data verified intact
- [ ] Prisma client regenerated
- [ ] Application code updated (if needed)
- [ ] Verification script run successfully
- [ ] Initial goals seeded from onboarding
- [ ] Monitoring/logging configured
- [ ] Rollback procedure documented
- [ ] Team notified of schema changes

---

## Maintenance Tasks

### Weekly Summary Generation

Set up cron job:
```bash
# Cron: Every Sunday at midnight
0 0 * * 0 cd /path/to/project && npx tsx jobs/generateWeeklySummaries.ts
```

### Monthly Archival

Set up cron job:
```bash
# Cron: 1st of each month at 2 AM
0 2 1 * * cd /path/to/project && npx tsx jobs/archiveOldTranscripts.ts
```

### Cleanup Expired Deletion Requests

Set up cron job:
```bash
# Cron: Daily at 3 AM
0 3 * * * cd /path/to/project && npx tsx jobs/cleanupExpiredRequests.ts
```

---

## Support

If you encounter issues during deployment:

1. Check the backup was created successfully
2. Verify database connection with `psql`
3. Check migration logs in `prisma/migrations/`
4. Test with verification script
5. If all else fails, restore from backup

**Emergency Rollback:**
```bash
# Restore database
psql -U hybridcoach -d hybridcoach_dev < backup_before_v2.sql

# Restore old schema
cp prisma/schema.prisma.backup prisma/schema.prisma
npx prisma generate
```

---

*Database V2.0 - Long-term Client Data Management*  
*Deployed: December 2025*
