# DETECTION GUIDE — LAYER 2: DOMAIN & CAPABILITY SIGNALS (v2)
### Each signal: stated values + detection, proposal move per value, and a defined FALLBACK for silence.

---

## SIGNAL 6 — VERTICAL / INDUSTRY

**Decides:** which proof story and case study leads the proposal.

**Detect (named in title or first 2 sentences, else inferred from workflow):**
- Real estate: MLS, realtor, listings, property management.
- Healthcare: patient, clinic, dental, dermatology, EHR, HIPAA, aesthetic, physician.
- Legal: law firm, attorney, personal injury, case management, paralegal.
- Construction/trades: HVAC, contractor, remodel, handyman, roofing, plumbing.
- Logistics: freight, fleet, dispatch, supply chain, carrier, load board.
- E-commerce: Shopify, Amazon, Walmart, order processing.
- Insurance/finance: underwriting, final expense, annuity.
- **Education (NOW A PRIORITY — 2nd biggest at 13%):** student, tutor, course, coaching, recruiter, career platform, advisor.

*Move:* lead with the matching vertical proof story. Education now needs its own dedicated case study.

**FALLBACK (no vertical — 57%, the majority):** treat as HORIZONTAL business automation. Lead with breadth and a cross-industry proof, and make reusability a selling point. This is not a gap — most of your pipeline is genuinely horizontal, so horizontal is a first-class route with its own strongest general proof.

---

## SIGNAL 7 — CORE CAPABILITY (multi-select)

**Decides:** which competency to foreground. Most posts stack 2+.

**Detect:**
- Voice: receptionist, phone, inbound/outbound call, Retell, Vapi, Twilio, IVR.
- RAG: knowledge base, retrieval, vector DB, Pinecone, Qdrant, pgvector, embeddings.
- Agents: AI agent, multi-agent, autonomous, LangChain/LangGraph/CrewAI.
- Automation (82%, dominant): automate, n8n, Zapier, Make, RPA, integration, workflow.
- Full-stack SaaS (74%): multi-tenant, platform, dashboard, Next/React/Node/Laravel, MVP, portal.

*Move:* record ALL that apply; foreground the PRIMARY (title or most-words). Automation and full-stack SaaS are the two spines to nail first.

**FALLBACK (capability unclear):** read the workflow. "Automate our operations" = automation. If still unclear, default to automation + full-stack SaaS (the two that cover most of the pipeline) and describe a general build.

---

## SIGNAL 8 — NAMED STACK & TOOLS

**Decides:** which exact tool names to reflect back as proof.

**Detect:** any named product/language/framework/API captured verbatim (GoHighLevel, n8n, Zapier, Twilio, Vapi, Retell, Next.js, React, Node, Python, Postgres, pgvector, Pinecone, Qdrant, Claude/OpenAI, Salesforce, HubSpot).

*Move:* name each tool back and cite a project using it.

**FALLBACK (no tools named):** propose your recommended stack with a one-line justification each. Silence here is permission to lead — do NOT stay vague.

---

## SIGNAL 9 — COMPLIANCE & SENSITIVITY LOAD (Yes / No — PROMOTED to a top-level fork)

**Decides:** how much the proposal must sell safety and process. This splits the pipeline ~50/50, so treat it as a primary branch, not a detail.

**HIGH — detect:** HIPAA, PHI, patient data, NDA, "confidential", "sensitive", on-prem, local hardware, data residency, GDPR.
- *Move:* add a dedicated reliability/security paragraph; when HIPAA + local processing, make it a top-three theme.

**LOW/NONE — detect:** no security language.
- *Move:* one light reassuring line, no more.

**FALLBACK (ambiguous):** include one brief security-and-reliability sentence by default. Cheap insurance; never costs you on a low-compliance post.

---

## SIGNAL 10 — DATA & SCALE INTENSITY (Yes / No)

**Decides:** whether this is a serious engineering buyer who sees through fluff.

**HIGH — detect:** "millions of records", high volume, exactly-once, dedup, TTLs, distributed, multi-tenant isolation, "not a CRUD app".
- *Move:* name the hard part back to them, show real depth fast, engage the TRUE hard part (data/pipeline), not the AI.

**FALLBACK (not stated — 80%):** assume normal scale and do NOT over-engineer the pitch. Keep the proposal outcome-focused rather than infrastructure-heavy unless a scale tell appears.
