# Hybrid-Coach – Master Project Plan

_Last updated: {{ date }}_

> This living document outlines the full scope, architecture, and incremental delivery plan for the Hybrid-Coach platform. Treat it as a single-source of truth for onboarding, sprint planning, and daily stand-ups.

---

## 1. Vision & Value Proposition
Hybrid-Coach blends human empathy with AI efficiency, enabling coaches to serve more clients while maintaining a personalised experience. Key differentiators:

1. **Tri-party video calls** (Coach + Client + AI).  
2. **Local AI runtime** (DigitalOcean GPU) → low latency, no 3rd-party data leakage.  
3. **Dynamic hand-off** between human & AI during sessions.  
4. **Personalised ambience** (client's favourite song & waiting-room UX).  

---

## 2. High-Level Architecture
```
┌───────────────────────────┐      ┌───────────────────────────┐
│         Browser           │──────│        Express API        │
│ React/EJS + WebRTC        │  WSS │  Node.js MVC  + Socket.io │
└───────────────────────────┘      └─────────┬─────────────────┘
                                            REST/WSS
                                     ┌───────▼────────┐
                                     │  AI Service    │  (Docker – llama.cpp, GPT-Q, etc.)
                                     │  Python FastAPI│
                                     └───────┬────────┘
                                             │ gRPC/REST
┌──────────────────────┐        ┌────────────▼────────┐
│   PostgreSQL (RDS)   │        │  Object Storage     │ (e.g. DO Spaces)
└──────────────────────┘        └─────────────────────┘
```

---

## 3. Functional Requirements
1. **Auth & Accounts**  
   • Email/password + social login (Google).  
   • Coach vs Client roles.
2. **Calendar Sync**  
   • OAuth with Google Calendar.  
   • Show coach availability, let client book.  
3. **Intake Form**  
   • Dynamic (JSON-driven) form builder.  
   • Stores answers in DB, exposes to AI via API.  
4. **Video Call**  
   • Pre-call waiting room with music.  
   • WebRTC/LiveKit for tri-party stream.  
   • UI toggle: Coach ↔ AI speaker.  
5. **AI-Hybrid Coach**  
   • Transcribe speech (Whisper - local).  
   • Summarise context + reasoning.  
   • Generate spoken response via TTS (Coqui-TTS).  
6. **Post-Call Summary**  
   • AI generates meeting minutes & action items.  
   • Email recap to client & coach.  

---

## 4. Non-Functional Requirements
• GDPR/CCPA compliance.  
• ≤300 ms latency for AI responses.  
• 99.5% availability SLA for paid tier.  
• End-to-end encryption for video & data-at-rest encryption (AES-256).  

---

## 5. Phased Roadmap
| Phase | Goal | Duration | Key Deliverables |
|-------|------|----------|------------------|
| M0 | Project bootstrap | 1 week | Repo, CI, Express skeleton, Hello World page |
| M1 | Auth & Basic Booking | 2 weeks | Login, profile, Calendar sync, schedule page |
| M2 | Video MVP | 3 weeks | WebRTC tri-party call, waiting room UX |
| M3 | AI Service MVP | 4 weeks | Speech-to-Text, text-based responses, CLI demo |
| M4 | Full Hybrid Session | 4 weeks | UI speaker toggle, TTS, AI insights panel |
| M5 | Production Hardening | 3 weeks | Load tests, monitoring, GDPR checklist |
| M6 | Growth & Payments | 2 weeks | Stripe subscriptions, referral codes |

**Time-box:** ~19 weeks total (buffered).

---

## 6. Sprint Backlog (Initial)
### Sprint 0 (Bootstrap)
- [ ] Init monorepo & dev-container.
- [ ] Add ESLint + Prettier + Husky.
- [ ] Basic Express server with EJS layout.
- [ ] `/healthz` route with supertest.

### Sprint 1 (Auth)
- [ ] User model (Prisma).
- [ ] Sign-up / Login pages.
- [ ] Google OAuth flow.
- [ ] Session management middleware.

*(Backlog continues in `docs/backlog.md`)*

---

## 7. Open Questions / Risks
1. GPU availability & cost on DigitalOcean vs AWS.
2. Best open-source TTS with real-time latency.
3. Legal/ethical concerns about AI advice.
4. WebRTC scaling beyond 3 participants.

---

## 8. Change Log
| Date | Change | Author |
|------|--------|--------|
| yyyy-mm-dd | Initial draft | AI assistant |

---

> **Next Action:** Complete M0 tasks, setup remote dev droplet, and schedule Sprint 0 planning. 