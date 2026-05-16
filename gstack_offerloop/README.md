# Offerloop — Planning & Research Docs

Generated from office hours sessions. Start with the design doc, then read in order.

## Documents

### 1. [Offerloop Copilot Design Doc](offerloop-copilot-design.md)
**Start here.** The master plan: three-phase roadmap from contact database to outreach copilot.
- Phase 1: Email quality (in progress, co-founder leading)
- Phase 2: The Pipeline — unified outreach flow (jobs → contacts → emails → send → track)
- Phase 3: Full autopilot — parallel agents, daily queue, approve-and-send
- Includes: premises, route migration table, credit model, success criteria, open questions

### 2. [Clado/Clodo Research](clado-clodo-research.md)
Competitive research on Clado/Clodo (YC X25) — the closest company to what Offerloop is building, but for B2B sales. Covers their parallel agent architecture, user journey, and what Offerloop should learn from them.

### 3. [Parallel Agent Architecture](parallel-agent-architecture.md)
**For the CTO.** Technical spec for implementing Clado-style parallel agents in Offerloop's Flask + Firestore stack. Includes code patterns, Firestore data model, failure handling, and a 1-day prototype plan. No new infrastructure required for v1.

### 4. [Scout Copilot Spec](SCOUT_COPILOT_SPEC.md)
Spec for evolving Scout from a chat sidebar into an agentic copilot with three surfaces: dashboard cards, Cmd+K command bar, and inline nudges.

### 5. [UI Audit](offerloop-ui-audit.md)
UI quality audit and findings.
