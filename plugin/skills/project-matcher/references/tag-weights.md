# Tag weights

| Category | Weight | Note |
| --- | --- | --- |
| Workflow type | 3 | Clients buy the shape of the work |
| AI capability | 3 | Except "AI powered", which is 0 |
| Product type | 2 | |
| Project stage | 0 (interim; normally 2) | Set to 0 until the tagging cleanup is finished |
| Industry | Not scored here | Industry is matched first, as its own step, in `industry-map.md` |
| Automation | 2 | |
| Compliance / sensitive data | 2, and required | Jobs with a compliance tag push projects without it below those with it |
| CRM and business tools | 1 | |
| AI models and platforms | 1 | |
| Tech stack | 1 | Reference only, never used to sell |

## Tag list

**Project stage:** MVP · New build (from scratch) · Prototype / proof of concept · Rescue / takeover · Extend existing product · Rebuild / migration · Bug fixing / debugging · Ongoing maintenance / support · Discovery / scoping / consulting · Full time / contract to hire

**Product type:** Web app · SaaS platform · Mobile app · Website / landing page · Admin dashboard · Chrome extension · Desktop app · Marketplace · Internal tool · API / backend service

**AI capability:** AI powered · AI agent · Multi agent system · AI voice agent · RAG / knowledge base · Chatbot · AI integration into existing product · AI automation · Document processing / OCR · Computer vision · LLM fine tuning / evaluation · Content generation · Speech / transcription · Predictive / ML models

**Automation:** Workflow automation · n8n · Make.com · Zapier · GoHighLevel · Web scraping / data pipelines · Email automation · SMS / WhatsApp messaging

**Workflow type:** Lead generation / enrichment · Outreach / follow up · Appointment booking / scheduling · Customer support · Claims / approvals / exceptions · Billing / payments · Reporting / analytics · Data sync across systems · User onboarding / verification · Role based access / permissions · Search / matching · Internal knowledge search · Inventory / orders · Project / task management

**Industry:** Healthcare · Dental · Insurance · Legal · Real estate · Construction · Home services · Logistics · E-commerce / retail · Education · Recruitment / HR · Finance / accounting · Hospitality · Automotive · Marketing / agency · Beauty / salon

**Compliance / sensitive data:** HIPAA / PHI · SOC 2 · GDPR · PCI / payment data · Security focused · Confidential / PII data

**CRM and business tools:** CRM (any) · HubSpot · Salesforce · Google Workspace · Slack · Airtable / Notion · Twilio · Stripe

**AI models and platforms:** OpenAI / ChatGPT · Claude · Gemini · LangChain / LangGraph · ElevenLabs · Azure / AWS AI · Retell AI

**Tech stack:** Node.js · Python · React / Next.js · PHP / Laravel · Supabase / Firebase · PostgreSQL · MongoDB · No code / low code · AI coding tools

The weights from `get_library` (Upwork Pro's Tag dictionary) win if they differ from this list.
