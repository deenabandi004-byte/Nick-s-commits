# OpenClaw vs Claude Agents: When to Use Which

Research date: 2026-05-15. Audience: Sid (CTO) and Nick (CEO), Offerloop.

## 1. Executive Summary

- Use **Claude Agents (Claude Code, Skills, Agent SDK, Managed Agents)** for anything that touches Offerloop's codebase, customer data, or paid infrastructure. The sandboxing model, first-party auth, and cloud trust boundary fit the "we have 91 paying users and Stripe credentials in scope" reality.
- Use **OpenClaw on the home server** as a founder-ops layer for chat-channel triage, scheduled "go check on X" jobs, and personal inbox/calendar tasks that benefit from a 24/7 heartbeat. Treat it as a *personal* assistant, not a *business* assistant.
- The decisive axes are (a) data sensitivity, (b) latency / always-on vs invoked, (c) channel surface (chat app vs IDE vs API), and (d) who maintains it. Sid maintains OpenClaw; both founders use Claude Agents.
- OpenClaw's biggest real risk in 2026 is not its code, it is the skill supply chain. Snyk's ToxicSkills audit found 36.82% of 3,984 ClawHub skills had at least one security flaw, and 13.4% had critical issues (https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/). Default to a vetted-only skill allowlist.
- Never give OpenClaw access to: Stripe keys, Firebase service account JSON, PDL/Hunter/SerpAPI keys, or any customer Gmail OAuth tokens. Those stay in Render env vars or 1Password. Judgment call, but firm: a single bad SKILL.md exfiltrating these would be a company-ending event.

## 2. What Each Tool Actually Is (verified 2026-05-15)

### OpenClaw

Open-source autonomous agent runtime, repo at https://github.com/openclaw/openclaw. Created by Peter Steinberger (founder of PSPDFKit), originally shipped as Clawdbot in November 2025, renamed to Moltbot after Anthropic trademark intervention, then renamed again to OpenClaw (https://www.trendingtopics.eu/clawdbot-moltbot-anthropic/).

Architecture (per README and https://docs.openclaw.ai/gateway/heartbeat):
- Single Node.js Gateway process listening on `127.0.0.1:18789` by default. Three layers: Gateway (connection) → Agent (proxy) → Skill (function), with WebSocket transport.
- Multi-channel inbox: WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, IRC, Microsoft Teams, Matrix, Feishu, LINE, Mattermost, Nextcloud Talk, Synology Chat, WeChat, QQ, WebChat, and others. Channels run simultaneously; the Gateway routes per chat (https://docs.openclaw.ai/channels).
- **Heartbeat daemon**: runs every 30 minutes by default (every hour with Anthropic OAuth). On each tick the agent reads `HEARTBEAT.md` from the workspace, decides if any item needs action, and either messages you or responds `HEARTBEAT_OK` (https://docs.openclaw.ai/gateway/heartbeat).
- **Skills**: Markdown packages following the `SKILL.md` spec. Workspace skills at `~/.openclaw/workspace/skills/<skill>/SKILL.md`. Community registry is ClawHub.
- **Sandboxing**: non-main sessions can run in Docker, SSH, or OpenShell sandboxes. Default sandbox allowlists `bash`, `process`, `read`, `write`; denies `browser`, `canvas`, `nodes`, `cron`.
- **DM pairing**: unknown senders on Telegram/WhatsApp/Signal/iMessage/Teams/Discord/Slack get pairing codes; messages are not processed until approved via `openclaw pairing approve <channel> <code>`.
- LLM provider agnostic: Claude, OpenAI, DeepSeek, local models. Supports OAuth profiles for ChatGPT/Codex and Claude subscriptions.

Versioning is `vYYYY.M.D`. Specific version numbers shift weekly; treat any specific version claim as stale within a month. Judgment call: do not pin to a specific version in this doc.

### Claude Agents (the umbrella)

Four products under one umbrella, all first-party Anthropic:

1. **Claude Code** (CLI coding agent). What you are reading this output in. Has subagents (scoped, own context window), Skills (Markdown instruction packs with frontmatter; bundled set includes `/simplify`, `/batch`, `/debug`, `/loop`, `/claude-api`), hooks (`PreToolUse`, `PostToolUse`, `SessionStart`, etc.), MCP servers, and OS-level sandboxing via Linux bubblewrap or macOS seatbelt with a network proxy that enforces a domain allowlist (https://code.claude.com/docs/en/sandboxing, https://www.anthropic.com/engineering/claude-code-sandboxing). Sandboxing reportedly cuts permission prompts by 84% in internal use.
2. **Claude Skills** (open standard). Specification released December 2025. OpenAI adopted the same format for Codex CLI and ChatGPT, so skills are now portable across vendors.
3. **Claude Agent SDK** (Python + TypeScript). Same agent loop, tool inventory, and context management as Claude Code, programmable. Includes 20+ built-in tools (Read, Write, Edit, Glob, Grep, Bash, WebFetch, WebSearch, Agent), lifecycle hooks, structured outputs, session resumption, and automatic compaction near context limit (https://code.claude.com/docs/en/agent-sdk/overview).
4. **Claude Managed Agents** (public beta as of April 8, 2026). Cloud-hosted, Anthropic runs the infra. Pricing: standard token rates plus $0.08 per session-hour of "running" status. Hard 24-hour ceiling per session (https://claude.com/blog/claude-managed-agents).

Pricing context: starting June 15, 2026, Anthropic splits Claude subscription billing into a first-party pool (chat, Claude Code CLI) and a third-party pool (Agent SDK and third-party agents). Programmatic credit caps: $20/Pro, $100/Max 5x, $200/Max 20x, overage at API rates (https://venturebeat.com/technology/anthropic-reinstates-openclaw-and-third-party-agent-usage-on-claude-subscriptions-with-a-catch). This affects how cheaply we can run high-volume Claude Code automation.

Also worth knowing: `claude.ai` Projects are available on the free tier (up to 5), and the consumer Claude app now exposes managed agents under "Claude Agents" for non-technical users. This is the surface Nick can use without touching a terminal.

## 3. Decision Framework

| Axis | Lean OpenClaw if... | Lean Claude Agents if... | Reasoning |
|------|---------------------|--------------------------|-----------|
| **Latency** | Background, scheduled, "check every 30 min" | Interactive, "I am typing now, respond fast" | OpenClaw's heartbeat is purpose-built for cron-style work. Claude Code is purpose-built for synchronous dev loops. Managed Agents fall in between, but session-hour billing punishes idle waiting. |
| **Always-on vs invoked** | Must run 24/7 without a human present (mailbox watcher, deal-flow scanner) | Invoked per task, ends when done | OpenClaw is a daemon, Claude Code is a process. Use the daemon for daemon things. |
| **Channel surface** | Telegram, WhatsApp, iMessage, Slack DM | CLI, IDE, web, API | OpenClaw owns the chat-app surface end-to-end. Claude has nothing equivalent for consumer messengers. |
| **Technical skill to set up** | You have a CTO who likes self-hosting | You want install-and-go | OpenClaw needs Node 24, pnpm, channel-by-channel auth (Telegram bot token, WhatsApp QR pairing, etc.). Claude Code is `npm i -g @anthropic-ai/claude-code`. |
| **Technical skill to maintain** | Sid will tail logs and patch CVEs | Nick will use it without a maintainer | OpenClaw shipped 137+ documented security advisories Feb-April 2026 per third-party trackers (https://blink.new/blog/openclaw-2026-cve-complete-timeline-security-history, treat exact count as unverified). Maintenance is a real cost. |
| **Data sensitivity** | Personal notes, public web research, low-stakes scheduling | Customer PII, payment data, OAuth tokens, codebase | OpenClaw runs your shell. A bad skill or a prompt injection through a scraped page can exfiltrate anything the daemon can read. Claude Code's sandbox + Anthropic's data policy is a stronger trust boundary for sensitive work. |
| **Determinism / output quality** | Quality is fine when the LLM behind it is good (any provider) | You want the latest Claude (Opus 4.7) with reliable tool use | Both can route to Claude. Claude Code stays closer to Anthropic's tool-use canon; OpenClaw is more pluralistic but exposes you to provider drift. |
| **Cost profile** | Self-hosted compute, your own API key, no per-session fee | Subscription bundles (Claude Pro/Max), or pay-per-session-hour for Managed Agents | OpenClaw cost = electricity + tokens. Claude Agents cost = subscription tier + (post-June-15) programmatic credit caps. For 2 founders, Claude Pro x2 covers most personal use; OpenClaw is cheaper at scale. |
| **Single-user vs team** | Single user, multiple channels | Team that wants shared agents (Managed Agents) | OpenClaw assumes one operator. Claude Managed Agents have org-level configs. |
| **Integration depth** | Read/write files on the home server, scrape pages, send messages | Touches Offerloop repo, Firestore, Stripe, PDL | Anything that calls Offerloop's production APIs should go through Claude Code with explicit hooks, not OpenClaw with shell + browser. |

### Directional recommendation per axis

- **Latency**: OpenClaw owns scheduled. Claude owns interactive. Don't fight this.
- **Always-on**: OpenClaw, always.
- **Channels**: OpenClaw if the user is on their phone in Telegram/WhatsApp. Claude if they are at a desk.
- **Setup skill**: Both founders can run Claude Code. Only Sid should run OpenClaw end-to-end.
- **Maintain skill**: Same. If Sid leaves the country for a week, OpenClaw should still be doing safe, narrow things.
- **Data sensitivity**: Anything Offerloop production-related defaults to Claude Agents. Personal stuff is fine on OpenClaw.
- **Determinism**: Tie. Both route to Claude. Pin OpenClaw to Claude Sonnet 4.6 or Opus 4.7 for the ops we care about; do not let it auto-fail-over to cheaper models silently.
- **Cost**: OpenClaw wins per-task at scale. Claude wins when you account for time-to-maintain.
- **Multi-user**: Managed Agents for shared, OpenClaw stays personal.
- **Integration depth**: Claude for anything in `connect-grow-hire/`, `backend/`, Firestore, or Stripe. OpenClaw never touches these.

## 4. Founder Cheat Sheet

| # | Task | Tool | Justification |
|---|------|------|---------------|
| 1 | "Watch UC LAUNCH and NVSC Slack/Discord, ping me when investors comment" | **OpenClaw** | Heartbeat polling of chat channels is its sweet spot. |
| 2 | "Refactor `job_board.py` from 8,800 lines into smaller modules" | **Claude Code** | Lives in the IDE, sandboxes the repo, runs `pytest` directly. Never give OpenClaw write access to this repo. |
| 3 | "Draft + send personalized cold emails to 20 USC student org leads" | **Claude Code with Gmail MCP** (or Claude SDK script) | Audit trail, structured outputs, easy to dry-run. OpenClaw's "send WhatsApp" is fine; cold-email-at-scale is a deliverability and brand risk that needs a human approval gate. |
| 4 | "Every morning, summarize what hit my Gmail overnight in Telegram" | **OpenClaw** | Personal inbox triage, chat channel, scheduled. Textbook use case (https://docs.openclaw.ai/gateway/heartbeat). |
| 5 | "Generate this week's blog post and commit to `main`" | **Claude Agents** (we already do this; it is a GitHub Action calling GPT-4o, but a Claude SDK rewrite is the right next step) | Touches the repo. Stays inside CI. |
| 6 | "Pitch deck v4: tighten Slide 7 wording, regenerate the LTV chart" | **claude.ai Projects / Claude Agents (consumer)** | Nick can do this without a CLI. Project memory keeps prior decks as context. |
| 7 | "Monitor Hacker News + r/csMajors for 'best AI networking tool' mentions and DM me on Telegram" | **OpenClaw** | Long-running scraper + chat notification. |
| 8 | "Triage incoming Offerloop support emails from Gmail and tag them in our CRM" | **Claude Code or Claude Agent SDK** | Touches customer data and our Gmail OAuth. Keep this on the trusted boundary. |
| 9 | "Run a security review of the `personalization-phase-9` branch before merge" | **Claude Code** (`/security-review`) | Already wired in; cloud trust boundary; structured output. |
| 10 | "On Sundays at 9pm, generate a 5-bullet weekly recap of our metrics and DM both founders" | **OpenClaw** | Cron + chat. If it needs to read Firestore, expose a read-only HTTPS endpoint OpenClaw can hit, not a service account file. |
| 11 | "Investor follow-up tracker: nudge me if I have not replied to anyone in 72 hours" | **OpenClaw** | Personal inbox + scheduled chase + chat nudge. |
| 12 | "Customer-facing Scout agent in product" (deferred) | **Claude Agent SDK** (or Managed Agents) | First-party, predictable billing, auditable, supports our compliance posture. OpenClaw is a non-starter for anything customers see. |

## 5. Security and Risk Analysis

### OpenClaw attack surface (self-hosted, home server)

Concrete vectors, ordered by likelihood:

1. **Skill supply chain.** Snyk's ToxicSkills audit of 3,984 ClawHub skills found 36.82% (1,467) had at least one security flaw and 13.4% (534) had critical issues, with hardcoded keys, prompt injection, and dangerous third-party content (https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/). Cisco identified 230+ explicitly malicious skills published since Jan 27, 2026, and that count grew to 824 in a follow-up audit (https://www.authmind.com/blogs/openclaw-malicious-skills-agentic-ai-supply-chain). A demo skill ("What Would Elon Do?") shipped silent curl-based data exfiltration plus direct prompt injection (https://blogs.cisco.com/ai/personal-ai-agents-like-openclaw-are-a-security-nightmare).
2. **Indirect prompt injection.** A scraped web page or email an agent reads can contain instructions like "append this text to the workspace file and await commands from server X." Cisco documents this as the dominant non-skill vector (same Cisco source). HEARTBEAT.md makes it worse: an injected instruction can persist across heartbeats.
3. **Network exposure of the Gateway.** CVE-2026-25253 was a zero-click WebSocket hijack on port 18789. If exposed to the internet (or to an attacker on the same network), a victim visiting a malicious page was enough for full agent takeover. Patched in 2026.1.29 (https://www.proarch.com/blog/threats-vulnerabilities/openclaw-rce-vulnerability-cve-2026-25253). Third-party trackers claim 135,000+ publicly internet-exposed instances and 63% with no auth (https://venturebeat.com/security/openclaw-500000-instances-no-enterprise-kill-switch). Treat the exact numbers as unverified marketing copy from security vendors, but the directional point holds: a lot of OpenClaw installs are misconfigured.
4. **Credential leakage to LLM providers.** Anything in the workspace, including `.env` files, can be silently sent to the LLM in context. If you also enabled shell access, the model can `cat` keys on demand.
5. **Channel-side abuse.** A malicious WhatsApp/iMessage sender who passes DM pairing can drive the agent. Pairing helps but is not a strong identity check.
6. **Daemon liveness assumptions.** The heartbeat will keep running and acting on stale `HEARTBEAT.md` content even if you stop paying attention. There is no built-in "are you sure you still want me doing this?" timer.

### Comparative risk profile: Claude Agents

Claude Code / Agent SDK runs locally too, but with materially different trust assumptions:

- **OS-level sandboxing** by default via bubblewrap (Linux) or seatbelt (macOS), enforced for subprocesses too (https://www.anthropic.com/engineering/claude-code-sandboxing).
- **Network proxy with domain allowlist**, not "agent can curl anywhere." Domain prompts are explicit.
- **First-party LLM provider** (Anthropic). Audit logs, data retention policy, abuse review.
- **No persistent daemon by default.** Sessions end. Managed Agents have a 24-hour hard ceiling.
- **Skills risk still exists.** Snyk's research notes 36% of skills had prompt injection patterns and the Skills standard is now shared with OpenAI, so a malicious skill from a third-party marketplace is dangerous in Claude Code too. Mitigation: use only Anthropic-bundled skills, your own skills, or audited team skills. Treat third-party skills the same way you treat OpenClaw skills.
- **Anthropic API key leakage** is the main credential risk, and it is bounded by API spend caps you can set on the dashboard.

Judgment call: Claude Agents are not *risk-free*, they are *bounded-risk*. OpenClaw is *unbounded-risk* by default. The bounds in Claude Agents come from sandbox primitives, a domain allowlist, and a single trusted vendor relationship.

### Data that should NEVER touch OpenClaw

Hard list:

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, anything in `backend/.env` that touches Stripe.
- `GOOGLE_APPLICATION_CREDENTIALS` (Firebase service account JSON). This single file owns Firestore.
- `PEOPLE_DATA_LABS_API_KEY`, `HUNTER_API_KEY`, `SERPAPI_KEY`, `OPENAI_API_KEY`, `CLAUDE_API_KEY`, `JINA_API_KEY`. Per-call costs and rate limits make these attractive theft targets.
- Customer Gmail OAuth tokens stored in Firestore at `users/{uid}/integrations/gmail`. Customer-trust event if leaked.
- Anything from the `users/{uid}/contacts/` subcollection (PII).
- `contacts.db` SQLite file (referenced in CLAUDE.md as gitignored but required in prod).
- Render dashboard credentials, Firebase console credentials, Stripe dashboard credentials.

If OpenClaw needs derived signals from these systems (e.g., "MRR this week"), expose a narrow read-only HTTPS endpoint with a per-skill bearer token. Never mount the service account file or paste a Stripe key into the OpenClaw workspace.

## 6. Hardening Checklist (weekend-executable)

Order matters. Do them in this sequence.

**Network**
- [ ] Confirm Gateway listens on `127.0.0.1:18789` only. Verify with `lsof -iTCP -sTCP:LISTEN -P | grep 18789`. Never bind to `0.0.0.0`.
- [ ] Put the home server behind a router-level firewall that drops inbound traffic to 18789 from anywhere except localhost.
- [ ] If remote access is needed, use Tailscale or a WireGuard tunnel, not port forwarding.
- [ ] Patch to the latest OpenClaw release before doing anything else. Subscribe to https://github.com/openclaw/openclaw/releases via RSS.

**Auth and pairing**
- [ ] Enable auth on the Gateway (whatever the current spec is; verify against https://docs.openclaw.ai). Do not run with the documented "no auth" default.
- [ ] Generate fresh API tokens for every channel (Telegram bot token, Slack app token). Do not reuse tokens from other projects.
- [ ] DM pairing on for every chat channel. Approve only Sid's and Nick's personal accounts. No "open to all" channels.

**Skills**
- [ ] Set a vetted-only skill allowlist. No installs from ClawHub without manual review of the `SKILL.md` and any referenced scripts. Snyk's data on this is unambiguous.
- [ ] Run Cisco AI Skill Scanner (or equivalent) over any skill before install (https://4sysops.com/archives/scan-openclaw-agent-skills-for-security-vulnerabilities-with-the-cisco-ai-skill-scanner/). Verify it is the real tool, not a typosquat.
- [ ] Keep skills in git, code-reviewed, two-author rule for new skills.

**Sandboxing**
- [ ] Run OpenClaw in Docker with: no host network, read-only mount for skills, writable mount only for workspace, no Docker socket mounted (no agent escape via Docker-in-Docker).
- [ ] Deny `browser`, `nodes`, `cron` by default in sandbox config. Enable per-skill only.
- [ ] Drop Linux capabilities you do not need (`--cap-drop=ALL` and add back only what is needed).

**Credentials**
- [ ] OpenClaw gets its own Anthropic API key with a low monthly cap (e.g., $50 hard limit on the Anthropic dashboard).
- [ ] No Offerloop-production secrets on the OpenClaw host. None. Audit `~/.openclaw/`, the workspace, and all skill files with `gitleaks` or `trufflehog` before going live.
- [ ] Use 1Password CLI or `pass` for any keys OpenClaw legitimately needs. No plaintext in `~/.openclaw/openclaw.json`.

**Audit and kill-switch**
- [ ] Tail the Gateway log to a separate file with daily rotation. Alert Sid on any new skill install, any shell command outside an allowlist regex, or any `curl`/`wget` to a non-allowlisted domain.
- [ ] Document the kill command: `systemctl stop openclaw` (Linux) or equivalent. Pin to a sticky note. There is no enterprise kill switch built in (https://venturebeat.com/security/openclaw-500000-instances-no-enterprise-kill-switch is a vendor source, but the absence of a built-in kill switch is independently observable from the repo).
- [ ] Run a "fire drill" once: simulate a malicious skill, verify logs caught it, verify the kill command works. Do this before relying on OpenClaw for anything real.

**HEARTBEAT hygiene**
- [ ] HEARTBEAT.md is treated as code: lives in git, reviewed before changes go live. No "let me just append this task" from a phone.
- [ ] Restrict heartbeats to business hours via `activeHours` until you trust the setup.
- [ ] Add an explicit "do not act, just notify" mode for any task involving sending external messages.

**Claude Code side** (for completeness)
- [ ] `/permissions` allowlist instead of "yes to all." Use auto mode only inside the sandbox.
- [ ] Domain allowlist on the network proxy. Block by default.
- [ ] Skills come from `~/.claude/skills/` under git, or from Anthropic's bundled set. Treat third-party Claude skills with the same suspicion as OpenClaw skills.
- [ ] Set spend caps on the Anthropic dashboard for the Agent SDK key.

## 7. Open Questions and Things to Revisit in 3 Months (August 2026)

- **OpenClaw stability.** The Feb-April CVE flood will either slow down (project matures) or continue (project structurally insecure). Re-evaluate in August. If CVEs are still 2/day, downgrade OpenClaw to "experiments only."
- **Anthropic billing changes.** June 15, 2026 splits subscription billing into first-party and programmatic pools. Once we have two months of usage data, recompute whether Claude Pro x2 is cheaper than the Agent SDK metered path for our workload.
- **Managed Agents maturity.** Currently public beta. If Anthropic adds long-running session checkpoints past 24h, some heartbeat-style work could migrate off OpenClaw entirely. Worth a re-look.
- **Skills standard cross-vendor adoption.** OpenAI adopting the Skills standard means a single audited skill can run in Claude Code, ChatGPT, and OpenClaw. Decide whether Offerloop's internal skills should be authored once against the standard for portability.
- **Customer-facing Scout agent.** Deferred from this doc. When we revisit, the question is Managed Agents vs Agent SDK self-host. Pricing and rate-limit empirical data needed first.
- **Independent OpenClaw security analyses.** Cisco and Snyk are the strongest current sources. Both have vendor incentives (Cisco sells DefenseClaw, Snyk sells skill scanning). Look for academic or government writeups by August. The arXiv paper on "Agent Skills Enable a New Class of Realistic and Trivially Simple Prompt Injections" (https://arxiv.org/html/2510.26328v1) is worth a full read.
- **Verify numerical claims.** Several stats cited here (135,000 exposed instances, 138 CVEs, 824 malicious skills) come from security-vendor blogs with skin in the game. Before quoting any of these externally (investor deck, blog post), pull primary sources or note as "third-party reports indicate."

## Sources

Primary:
- OpenClaw repo: https://github.com/openclaw/openclaw
- OpenClaw docs: https://docs.openclaw.ai/gateway/heartbeat, https://docs.openclaw.ai/channels
- Claude Code docs: https://code.claude.com/docs/en/skills, https://code.claude.com/docs/en/sandboxing, https://code.claude.com/docs/en/agent-sdk/overview
- Anthropic engineering: https://www.anthropic.com/engineering/claude-code-sandboxing, https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk
- Claude Managed Agents: https://claude.com/blog/claude-managed-agents
- Claude pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Claude Managed Agents docs: https://platform.claude.com/docs/en/managed-agents/overview

Security analyses (vendor, treat as directional):
- Cisco on OpenClaw: https://blogs.cisco.com/ai/personal-ai-agents-like-openclaw-are-a-security-nightmare, https://blogs.cisco.com/ai/cisco-announces-defenseclaw
- Cisco Skill Scanner writeup: https://4sysops.com/archives/scan-openclaw-agent-skills-for-security-vulnerabilities-with-the-cisco-ai-skill-scanner/
- Snyk ToxicSkills: https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/, https://snyk.io/blog/skill-scanner-false-security/
- Authmind on malicious skills: https://www.authmind.com/blogs/openclaw-malicious-skills-agentic-ai-supply-chain
- IBM x-force on agentic AI risks: https://www.ibm.com/think/x-force/what-openclaw-reveals-about-agentic-ai-security-risks
- CVE-2026-25253 writeup: https://www.proarch.com/blog/threats-vulnerabilities/openclaw-rce-vulnerability-cve-2026-25253
- VentureBeat on exposure: https://venturebeat.com/security/openclaw-500000-instances-no-enterprise-kill-switch
- arXiv on prompt injection in skills: https://arxiv.org/html/2510.26328v1
- Anthropic billing changes: https://venturebeat.com/technology/anthropic-reinstates-openclaw-and-third-party-agent-usage-on-claude-subscriptions-with-a-catch, https://thenewstack.io/anthropic-agent-sdk-credits/

Background and history:
- OpenClaw renaming: https://www.trendingtopics.eu/clawdbot-moltbot-anthropic/
- Peter Steinberger profile: https://fortune.com/2026/02/19/openclaw-who-is-peter-steinberger-openai-sam-altman-anthropic-moltbook/
- Pragmatic Engineer interview: https://newsletter.pragmaticengineer.com/p/the-creator-of-clawd-i-ship-code
