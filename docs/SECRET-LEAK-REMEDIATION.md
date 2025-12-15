# 🚨 CRITICAL: Secret Leak Remediation Instructions

## Context

The `hybrid-coach` repository was accidentally converted from private to public, exposing the `.env.local` file and SSH private keys to GitHub. Multiple secrets have been compromised and require immediate remediation.

**Repository:** `ultradaoto/hybrid-coach`  
**Leak Date:** May 17th 2025, 23:32:46 UTC  
**Commit:** `3194dad4`

---

## PHASE 0: IMMEDIATE ACTIONS (DO FIRST)

### 0.1 Make Repository Private Immediately

```bash
# If you have GitHub CLI installed:
gh repo edit ultradaoto/hybrid-coach --visibility private

# Otherwise, do this manually at:
# https://github.com/ultradaoto/hybrid-coach/settings → Danger Zone → Make Private
```

### 0.2 Confirm Repository is Private

```bash
gh repo view ultradaoto/hybrid-coach --json isPrivate
```

**DO NOT PROCEED UNTIL THE REPO IS PRIVATE.**

---

## PHASE 1: INVESTIGATION & REPORT

### 1.1 Generate Comprehensive Leak Report

Create a detailed report of exactly what was exposed. Run the following analysis:

```bash
# Navigate to the repository
cd /path/to/hybrid-coach

# 1. Find the exact commit that exposed secrets
git log --all --full-history -- ".env*" "*.pem" "*.key" "id_rsa*" "id_ed25519*"

# 2. Show the contents of the leaked commit
git show 3194dad4 --name-only

# 3. List ALL files that were in .env.local at the time of leak
git show 3194dad4:.env.local 2>/dev/null || echo "File path may differ"

# 4. Search for any other potential secret files in history
git log --all --full-history --diff-filter=A -- "*.env*" "*.pem" "*.key" ".env*" "secrets*" "credentials*"

# 5. Check if .gitignore was missing or misconfigured
git show 3194dad4:.gitignore 2>/dev/null | grep -E "\.env|\.pem|\.key|id_rsa"

# 6. Find when the repo was made public (check GitHub audit log or recent activity)
gh api repos/ultradaoto/hybrid-coach/events --paginate | head -100
```

### 1.2 Create Leak Inventory Document

Create a file called `LEAK_INVENTORY.md` with the following structure:

```markdown
# Secret Leak Inventory Report
**Generated:** [TIMESTAMP]
**Repository:** ultradaoto/hybrid-coach
**Leak Commit:** 3194dad4
**Leak Date:** May 17th 2025, 23:32:46 UTC

## Exposed Secrets Summary

| Secret Type | File | Line | Status | Remediation |
|-------------|------|------|--------|-------------|
| OpenAI API Key | .env.local | L21 | ⚠️ DISABLED BY OPENAI | Need new key |
| Twilio Account SID | .env.local | L29 | 🔴 EXPOSED | Needs rotation |
| Twilio Auth Token | .env.local | L?? | 🔴 EXPOSED | Needs rotation |
| OpenSSH Private Key #1 | [PATH] | - | 🔴 EXPOSED | Regenerate |
| OpenSSH Private Key #2 | [PATH] | - | 🔴 EXPOSED | Regenerate |
| OpenSSH Private Key #3 | [PATH] | - | 🔴 EXPOSED | Regenerate |
| OpenSSH Private Key #4 | [PATH] | - | 🔴 EXPOSED | Regenerate |
| Database Credentials | .env.local | L?? | 🔴 EXPOSED | Rotate password |
| Google OAuth2 Client ID | .env.local | L?? | 🔴 EXPOSED | Regenerate |
| Google OAuth2 Client Secret | .env.local | L?? | 🔴 EXPOSED | Regenerate |

## Root Cause Analysis

### Why did this happen?
1. [ ] `.gitignore` was missing `.env.local` entry
2. [ ] `.gitignore` was not present in the repository
3. [ ] `.env.local` was force-added with `git add -f`
4. [ ] SSH keys were stored inside the repository directory
5. [ ] Repository was converted from private to public without audit

### Timeline of Events
- [DATE/TIME]: Repository created (private/public?)
- [DATE/TIME]: .env.local first committed
- [DATE/TIME]: SSH keys committed
- [DATE/TIME]: Repository made public
- [DATE/TIME]: GitGuardian alerts received
- [DATE/TIME]: OpenAI disabled API key
- [DATE/TIME]: Remediation started

## Exposure Window
- **Duration exposed:** [CALCULATE: from public conversion to now]
- **Potential access:** Anyone with the GitHub API or direct access could have scraped these credentials

## Files That Should NEVER Have Been Committed
[List all sensitive files found in git history]
```

### 1.3 Extract Full .env.local Contents from Git History

```bash
# Get the exact contents that were exposed
git show 3194dad4:.env.local > EXPOSED_ENV_CONTENTS.txt

# Parse and categorize each exposed variable
echo "=== EXPOSED ENVIRONMENT VARIABLES ===" 
git show 3194dad4:.env.local | grep -E "^[A-Z_]+=" | cut -d'=' -f1
```

**List every single environment variable that was exposed and its purpose.**

---

## PHASE 2: SECRET ROTATION (ALL SERVICES)

### 2.1 OpenAI API Key

**Status:** Already disabled by OpenAI

```bash
# Action Required:
# 1. Go to: https://platform.openai.com/api-keys
# 2. Create new API key
# 3. Update local .env.local with new key
# 4. Update server environment variables
```

**Local update:**
```bash
# In .env.local, update:
OPENAI_API_KEY=sk-proj-[NEW_KEY_HERE]
```

**Server update:**
```bash
# SSH to server and update environment
ssh user@server
# Update in PM2 ecosystem, systemd service, or hosting platform env vars
```

### 2.2 Twilio Credentials

**Console:** https://console.twilio.com/

```bash
# Actions Required:
# 1. Go to: https://console.twilio.com/us1/account/keys-credentials/api-keys
# 2. Rotate the Auth Token: Account → General Settings → Auth Token → Rotate
# 3. Create new API Key if using API keys
# 4. Update all locations using these credentials
```

**Local update:**
```bash
# In .env.local, update:
TWILIO_ACCOUNT_SID=[IF_CHANGED]
TWILIO_AUTH_TOKEN=[NEW_AUTH_TOKEN]
TWILIO_API_KEY=[NEW_API_KEY]
TWILIO_API_SECRET=[NEW_API_SECRET]
```

**Check Twilio logs for unauthorized access:**
```
https://console.twilio.com/us1/monitor/logs/debugger
```

### 2.3 SSH Keys (CRITICAL)

**You have 4 exposed SSH private keys. ALL must be regenerated.**

```bash
# 1. Identify all exposed SSH keys in the repo
find . -name "id_rsa*" -o -name "id_ed25519*" -o -name "*.pem" 2>/dev/null

# 2. Check git history for SSH keys
git log --all --full-history -- "*.pem" "*id_rsa*" "*id_ed25519*" "*.key"

# 3. Generate NEW SSH keys (do this locally, NOT in the repo)
cd ~/.ssh
ssh-keygen -t ed25519 -C "ultradaoto@gmail.com" -f id_ed25519_new

# 4. List all servers/services using the old keys and update them:
```

**Services to update with new SSH public key:**

| Service | Location | Action |
|---------|----------|--------|
| GitHub | https://github.com/settings/keys | Delete old, add new |
| Production Server | ~/.ssh/authorized_keys | Remove old, add new |
| Staging Server | ~/.ssh/authorized_keys | Remove old, add new |
| Any CI/CD | GitHub Actions secrets, etc. | Update deploy keys |

```bash
# On each server, remove the compromised public key:
ssh user@server "sed -i '/OLD_KEY_FINGERPRINT/d' ~/.ssh/authorized_keys"

# Add new public key:
ssh-copy-id -i ~/.ssh/id_ed25519_new.pub user@server
```

### 2.4 Database Credentials

**Identify your database provider and rotate credentials:**

```bash
# Check what database URL was exposed
git show 3194dad4:.env.local | grep -i "database\|postgres\|mysql\|mongo\|prisma"
```

**For common providers:**

| Provider | Console URL | Action |
|----------|-------------|--------|
| PlanetScale | https://app.planetscale.com/ | Database → Settings → Passwords → Create new |
| Supabase | https://supabase.com/dashboard | Project → Settings → Database → Reset password |
| Neon | https://console.neon.tech/ | Project → Connection Details → Reset password |
| Railway | https://railway.app/dashboard | Project → Variables → Regenerate |
| Self-hosted | N/A | `ALTER USER ... PASSWORD '...'` |

```bash
# Update local .env.local
DATABASE_URL="postgresql://user:NEW_PASSWORD@host:5432/db?sslmode=require"

# Update Prisma and test connection
npx prisma db pull
npx prisma generate
```

**CHECK DATABASE LOGS FOR UNAUTHORIZED ACCESS IMMEDIATELY.**

### 2.5 Google OAuth2 Credentials

**Console:** https://console.cloud.google.com/apis/credentials

```bash
# Actions Required:
# 1. Go to Google Cloud Console → APIs & Services → Credentials
# 2. Find the exposed OAuth 2.0 Client ID
# 3. DELETE IT (do not just regenerate secret - delete entirely)
# 4. Create NEW OAuth 2.0 Client ID
# 5. Configure authorized redirect URIs for new client
# 6. Update application with new credentials
```

**Local update:**
```bash
# In .env.local, update:
GOOGLE_CLIENT_ID=[NEW_CLIENT_ID]
GOOGLE_CLIENT_SECRET=[NEW_CLIENT_SECRET]
```

### 2.6 Any Other Exposed Secrets

**Audit .env.local for ALL variables and categorize:**

```bash
git show 3194dad4:.env.local | while read line; do
  if [[ $line =~ ^[A-Z_]+=.+ ]]; then
    var_name=$(echo "$line" | cut -d'=' -f1)
    echo "Found: $var_name - [DETERMINE IF SENSITIVE AND ACTION REQUIRED]"
  fi
done
```

**Common secrets to check for:**

- [ ] `NEXTAUTH_SECRET` / `JWT_SECRET` - Regenerate with `openssl rand -base64 32`
- [ ] `SESSION_SECRET` - Regenerate
- [ ] `ENCRYPTION_KEY` - Regenerate
- [ ] `STRIPE_SECRET_KEY` - Rotate at https://dashboard.stripe.com/apikeys
- [ ] `SENDGRID_API_KEY` - Rotate at https://app.sendgrid.com/settings/api_keys
- [ ] `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` - Rotate in IAM
- [ ] `DEEPGRAM_API_KEY` - Rotate at https://console.deepgram.com/
- [ ] `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` - Rotate in LiveKit dashboard

---

## PHASE 3: SERVER-SIDE CLEANUP

### 3.1 Update All Server Environment Variables

```bash
# SSH to production server
ssh user@production-server

# Check current environment configuration method:
# Option A: PM2 ecosystem
pm2 env hybrid-coach

# Option B: systemd service
cat /etc/systemd/system/hybrid-coach.service

# Option C: Docker
docker inspect hybrid-coach | grep -A 50 "Env"

# Option D: .env file on server
cat /var/www/hybrid-coach/.env
```

**Update server environment with ALL new credentials.**

### 3.2 Restart Services with New Credentials

```bash
# After updating all environment variables:

# PM2
pm2 restart hybrid-coach
pm2 logs hybrid-coach --lines 50  # Verify no auth errors

# systemd
sudo systemctl restart hybrid-coach
sudo journalctl -u hybrid-coach -f  # Check logs

# Docker
docker-compose down && docker-compose up -d
docker logs -f hybrid-coach
```

### 3.3 Verify All Services Working

```bash
# Create a verification script
cat << 'EOF' > verify_services.sh
#!/bin/bash

echo "=== Verifying Service Connections ==="

# Test OpenAI
echo -n "OpenAI API: "
curl -s https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY" | grep -q "id" && echo "✅ OK" || echo "❌ FAILED"

# Test Twilio
echo -n "Twilio API: "
curl -s -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID.json" | grep -q "sid" && echo "✅ OK" || echo "❌ FAILED"

# Test Database
echo -n "Database: "
npx prisma db execute --stdin <<< "SELECT 1" && echo "✅ OK" || echo "❌ FAILED"

# Test Google OAuth (just verify env vars exist)
echo -n "Google OAuth: "
[[ -n "$GOOGLE_CLIENT_ID" && -n "$GOOGLE_CLIENT_SECRET" ]] && echo "✅ Configured" || echo "❌ Missing"

echo "=== Verification Complete ==="
EOF
chmod +x verify_services.sh
./verify_services.sh
```

---

## PHASE 4: GIT HISTORY CLEANUP

### 4.1 Install BFG Repo Cleaner

```bash
# macOS
brew install bfg

# Linux
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar -O bfg.jar
alias bfg='java -jar bfg.jar'
```

### 4.2 Create Backup Before Cleanup

```bash
cd /path/to/hybrid-coach
cd ..
cp -r hybrid-coach hybrid-coach-backup-$(date +%Y%m%d)
```

### 4.3 Remove Secrets from Git History

```bash
cd hybrid-coach

# Create a file listing all patterns to remove
cat << 'EOF' > secrets-to-remove.txt
.env
.env.local
.env.production
.env.development
.env.*.local
*.pem
id_rsa
id_rsa.pub
id_ed25519
id_ed25519.pub
*.key
secrets.json
credentials.json
EOF

# Option A: Use BFG to remove files
bfg --delete-files .env.local
bfg --delete-files "*.pem"
bfg --delete-files "id_rsa*"
bfg --delete-files "id_ed25519*"

# Option B: Use git filter-repo (more powerful)
pip install git-filter-repo

git filter-repo --path .env.local --invert-paths
git filter-repo --path-glob '*.pem' --invert-paths
git filter-repo --path-glob 'id_rsa*' --invert-paths
git filter-repo --path-glob 'id_ed25519*' --invert-paths
```

### 4.4 Clean Up and Force Push

```bash
# After BFG or filter-repo:
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push to remote (requires --force since history changed)
git push origin --force --all
git push origin --force --tags
```

### 4.5 Verify Cleanup

```bash
# Search entire history for any remaining secrets
git log --all -p | grep -E "(sk-|TWILIO_|DATABASE_URL|GOOGLE_CLIENT)" | head -20

# Should return nothing if cleanup was successful
```

---

## PHASE 5: PREVENTION SETUP

### 5.1 Create Proper .gitignore

```bash
cat << 'EOF' > .gitignore
# Environment files - NEVER COMMIT THESE
.env
.env.*
.env.local
.env.*.local
!.env.example

# SSH and security keys
*.pem
*.key
id_rsa
id_rsa.pub
id_ed25519
id_ed25519.pub
*.crt
*.p12

# Secrets and credentials
secrets.json
credentials.json
service-account*.json
*-credentials.json

# IDE and OS
.idea/
.vscode/
.DS_Store
Thumbs.db

# Dependencies
node_modules/
.pnp.*

# Build outputs
dist/
build/
.next/
out/

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Test coverage
coverage/

# Prisma
prisma/*.db
prisma/*.db-journal
EOF

git add .gitignore
git commit -m "chore: add comprehensive .gitignore to prevent secret leaks"
```

### 5.2 Create .env.example Template

```bash
cat << 'EOF' > .env.example
# ===========================================
# HYBRID COACH ENVIRONMENT CONFIGURATION
# ===========================================
# Copy this file to .env.local and fill in values
# NEVER commit .env.local to git!

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_API_KEY=SK...
TWILIO_API_SECRET=...

# Database (Prisma)
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require

# Google OAuth
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# LiveKit
LIVEKIT_API_KEY=API...
LIVEKIT_API_SECRET=...
LIVEKIT_URL=wss://...

# Deepgram
DEEPGRAM_API_KEY=...

# NextAuth / Session
NEXTAUTH_SECRET=... # Generate with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

# Add other non-sensitive config below
NODE_ENV=development
EOF

git add .env.example
git commit -m "chore: add .env.example template for safe onboarding"
```

### 5.3 Install Pre-Commit Hooks with ggshield

```bash
# Install ggshield (GitGuardian CLI)
pip install ggshield

# Or with npm
npm install -g @gitguardian/ggshield

# Initialize ggshield
ggshield auth login

# Install pre-commit hook
ggshield install --mode local

# Alternative: Use husky + ggshield
npm install --save-dev husky
npx husky install
npx husky add .husky/pre-commit "ggshield secret scan pre-commit"
```

### 5.4 Add GitHub Secret Scanning

Create `.github/secret_scanning.yml`:

```yaml
# Enable GitHub's built-in secret scanning
# This is automatic for public repos, but configure for private
paths-ignore:
  - 'docs/**'
  - '**/*.md'
```

### 5.5 Create Security Documentation

```bash
cat << 'EOF' > SECURITY.md
# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, please email ultradaoto@gmail.com directly.
Do NOT create a public GitHub issue.

## Secret Management

This project uses environment variables for all secrets. 

### Rules:
1. **NEVER** commit `.env`, `.env.local`, or any file containing secrets
2. **NEVER** commit SSH keys, PEM files, or certificates
3. **ALWAYS** use `.env.example` as a template
4. **ALWAYS** run `ggshield secret scan` before committing

### Required Secrets:
See `.env.example` for the list of required environment variables.

### Rotating Secrets:
If you suspect a secret has been compromised:
1. Immediately rotate the credential at the service provider
2. Update all deployments with the new credential
3. Check service logs for unauthorized access
4. Notify the team

## Pre-Commit Hooks

This repository uses ggshield to scan for secrets before commits.
Install with: `ggshield install --mode local`
EOF

git add SECURITY.md
git commit -m "docs: add security policy and secret management guidelines"
```

---

## PHASE 6: AUDIT & MONITORING

### 6.1 Check Service Access Logs

**For each service, check for unauthorized access during the exposure window:**

| Service | Log Location | What to Look For |
|---------|--------------|------------------|
| OpenAI | https://platform.openai.com/usage | Unusual API calls, high usage |
| Twilio | https://console.twilio.com/us1/monitor/logs | Calls/SMS you didn't send |
| Google Cloud | https://console.cloud.google.com/logs | OAuth attempts, API calls |
| Database | Provider dashboard or server logs | Unknown queries, data access |
| GitHub | https://github.com/settings/security-log | Unauthorized access |

### 6.2 Set Up Alerts for Future

- Enable billing alerts on all cloud services
- Set up usage anomaly detection where available
- Enable 2FA on all service accounts
- Consider using a secrets manager (Vault, AWS Secrets Manager, etc.)

---

## FINAL CHECKLIST

### Immediate Actions
- [ ] Repository made private
- [ ] All exposed credentials identified and documented

### Credential Rotation
- [ ] OpenAI API Key - rotated
- [ ] Twilio Auth Token - rotated
- [ ] Twilio API Keys - rotated
- [ ] SSH Keys - all 4 regenerated
- [ ] Database password - rotated
- [ ] Google OAuth credentials - regenerated
- [ ] Any other secrets in .env.local - rotated

### Server Updates
- [ ] Production server environment updated
- [ ] Staging server environment updated (if applicable)
- [ ] CI/CD secrets updated
- [ ] All services restarted and verified working

### Git Cleanup
- [ ] Secrets removed from git history
- [ ] Force pushed cleaned history
- [ ] Verified no secrets remain in history

### Prevention
- [ ] .gitignore updated with all sensitive patterns
- [ ] .env.example created
- [ ] Pre-commit hooks installed (ggshield)
- [ ] SECURITY.md documented
- [ ] Team notified of incident and new procedures

### Audit
- [ ] OpenAI usage logs checked
- [ ] Twilio logs checked
- [ ] Database logs checked
- [ ] Google Cloud logs checked
- [ ] No unauthorized access detected

---

## REPORT TEMPLATE

After completing all phases, generate a final incident report:

```markdown
# Security Incident Report: Secret Leak - hybrid-coach

**Date of Incident:** May 17th 2025, 23:32:46 UTC
**Date Discovered:** [DATE]
**Date Resolved:** [DATE]
**Severity:** HIGH

## Executive Summary
The hybrid-coach repository was inadvertently made public, exposing environment
variables and SSH keys. All credentials have been rotated and preventive measures
implemented.

## What Happened
[Detailed timeline]

## What Was Exposed
[List all secrets]

## Impact Assessment
[Any unauthorized access detected?]

## Remediation Actions Taken
[List all actions]

## Prevention Measures Implemented
[List all preventive measures]

## Lessons Learned
[What will be done differently]

## Action Items
[Any remaining tasks]
```

---

**IMPORTANT:** Execute these instructions in order. Do not skip phases. Report back with:
1. The complete LEAK_INVENTORY.md
2. Confirmation of each credential rotation
3. Any errors or issues encountered
4. Final verification that all services are working
5. The completed incident report