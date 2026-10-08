# Project library (backup)

Snapshot of the team's "Stackup Project Tag Library" sheet, taken 2026-10-08, 42 projects (the same projects as Upwork Pro). Backup only. The plugin reads the library from Upwork Pro (`get_library`) and uses this file only if that fails.

Every project in this library is publicly showable.

Link order for proposals: match the job platform first (web job: Landing page or System link; mobile job: Mobile link), then Case study link (flag it), then Staging link (last resort, flag it).

## Navience
* System link: https://navienceai.com
* Overview: An AI prior authorization engine for payers, MSOs and delegated IPAs that reviews requests against Medicare, Medi-Cal and health plan criteria. It approves requests that clearly qualify, escalates the rest to nurses or medical directors with full reasoning, and logs every decision for audit.
* Case study summary: Project: Navience, an AI prior authorization and utilization management engine for payers, MSOs and delegated IPAs (Healthcare).
Problem: Clinical reviewers checked every authorization by hand against Medicare, Medi-Cal, health plan and IPA rules, causing slow turnaround, inconsistent decisions and no clear record of why requests were approved or escalated.
Solution: We built an AI decision engine that matches each request to the right payer policy, approves what clearly qualifies and escalates edge cases to nurses or medical directors with full reasoning.
Key features: PHI removal and CPT and referral context; policy retrieval with vector search; parallel sub agents for timing, thresholds, treatment history and synonyms; capitation and DOFR checks; Exact Match and Smart Standard modes.
Technology: Claude Opus, GPT-4o, AWS Bedrock (Titan embeddings), Qdrant, TensorZero, Fastify, MySQL, React.
Results: Routine requests approved automatically, edge cases routed with clear reasoning, and every decision logged with policy source, confidence, tokens and cost for a full audit trail.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Discovery / scoping / consulting; Full time / contract to hire
* Product type: Web app; SaaS platform; Website / landing page; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent; Multi agent system; RAG / knowledge base; AI integration into existing product; AI automation; Document processing / OCR; LLM fine tuning / evaluation; Predictive / ML models
* Automation: Workflow automation; Email automation
* Workflow type: Lead generation / enrichment; Claims / approvals / exceptions; Reporting / analytics; Data sync across systems; Role based access / permissions
* Industry: Healthcare; Insurance
* Compliance / sensitive data: HIPAA / PHI; Confidential / PII data
* AI models and platforms: OpenAI / ChatGPT; Claude; Azure / AWS AI
* Tech stack: Node.js; React / Next.js

## Open Dental AI Calling (Chloe)
* Landing page: https://www.smilesofvirginia.com/
* Overview: An AI voice agent for a dental practice, built on Retell AI and integrated with Open Dental, that answers patient questions and books and reschedules appointments during the call. It verifies callers before touching any record, runs outbound recall campaigns and logs every call in a web dashboard.
* Case study summary: Project: AI voice agent for a dental practice running Open Dental (Healthcare, Dental).
Problem: Missed calls turned into missed appointments, the front desk spent hours on routine questions and scheduling, and existing patients were not coming back for their next visit.
Solution: We built a HIPAA conscious Retell AI voice agent that answers patient calls and books or reschedules appointments live inside Open Dental, with strict verification before any record changes.
Key features: Knowledge base Q&A; real time booking and rescheduling; name, date of birth and phone verification; front desk transfer and after hours callback logging; outbound recall campaigns.
Technology: Retell AI (under a signed BAA), Open Dental API, self hosted Open Dental server, cloud web dashboard.
Results: Patient calls answered with real bookings, front desk time freed from routine scheduling, patient records protected, and every call logged with recording and summary.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Bug fixing / debugging; Ongoing maintenance / support; Discovery / scoping / consulting; Full time / contract to hire
* Product type: Web app; API / backend service
* AI capability: AI powered; AI agent; Multi agent system; AI voice agent; RAG / knowledge base; Chatbot; AI automation; LLM fine tuning / evaluation; Speech / transcription
* Automation: Workflow automation; Email automation
* Workflow type: Lead generation / enrichment; Outreach / follow up; Appointment booking / scheduling; Billing / payments; Reporting / analytics; Data sync across systems; Internal knowledge search
* Industry: Healthcare; Dental
* Compliance / sensitive data: HIPAA / PHI; Confidential / PII data
* CRM and business tools: Twilio
* AI models and platforms: OpenAI / ChatGPT; Retell AI
* Tech stack: Node.js; No code / low code; AI coding tools

## DentalMasteryDynamics
* System link: https://portal.dentalmasterydynamics.com/
* Case study link: https://stackupsolutions.com/projects/dental-mastery-dynamics
* Overview: A HIPAA compliant, multi tenant AI analytics SaaS for dental practices built on an OpenDental integration. It tracks KPIs such as case acceptance, hygiene utilization and schedule efficiency, and sends a daily AI review of the actions that matter most.
* Case study summary: Project: Dental Mastery Dynamics, a multi tenant AI analytics SaaS for dental practices (Healthcare, Dental).
Problem: Practices had their data locked in Open Dental with no clear daily view of case acceptance, hygiene utilization and schedule efficiency, so decisions relied on guesswork.
Solution: We built a HIPAA compliant platform that syncs practice data, calculates KPIs nightly and delivers a daily AI review with practical coaching, without exposing PHI.
Key features: Secure Open Dental sync; configurable KPI engine; daily AI review grounded in coaching playbooks; Twilio SMS assistant and AI voice hotline for live KPIs; admin panel for subscriptions and cross clinic performance.
Technology: Open Dental API, LLM with RAG, Twilio SMS, AI voice, encryption and tokenized sessions.
Results: Managers get clear daily priorities and live KPIs on demand, PHI never reaches the LLM, and built in compliance became a sales advantage.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app; SaaS platform; Website / landing page; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent; AI voice agent; RAG / knowledge base; Chatbot; AI integration into existing product; AI automation; Document processing / OCR; LLM fine tuning / evaluation; Speech / transcription; Predictive / ML models
* Automation: Workflow automation; n8n; Email automation; SMS / WhatsApp messaging
* Workflow type: Billing / payments; Reporting / analytics; Data sync across systems; User onboarding / verification; Role based access / permissions
* Industry: Healthcare; Dental
* Compliance / sensitive data: HIPAA / PHI; PCI / payment data; Confidential / PII data
* CRM and business tools: CRM (any)
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: Node.js; React / Next.js; PostgreSQL

## DentAI Call
* Landing page: https://dentaicall.com
* System link: https://admin.dentaicall.com/login
* Overview: DentAI is Stackup's AI virtual front desk for dental practices, sold under the agent name Chloe. It answers every call 24/7, verifies patients, books and reschedules directly in Open Dental, Curve Dental or CareStack, runs recall and reminder calls, sends payment links and reports every conversation to an Insights dashboard.
* Case study summary: Project: DentAI, Stackup's AI virtual front desk for dental practices, first deployed at a family dental practice in Virginia (Healthcare, Dental).
Problem: Practices lost patients to missed daytime and after hours calls, front desk staff were buried in phone work, and no shows and unworked recall lists left gaps in the schedule.
Solution: We built an AI voice receptionist that answers every call 24/7 and books, reschedules and cancels directly in the PMS, following each practice's own rules and confirming only after the action succeeds.
Key features: 24/7 DentAI Voice; live PMS scheduling with practice rules; patient verification and privacy rules; recall, reminders, intake and payment links; Insights dashboard.
Technology: Retell AI (29 node flow, 11 custom tools), NestJS API, Next.js admin panel, Open Dental, Curve Dental and CareStack.
Results: Every call answered, front desk time returned to patient care, and practices go live in about two weeks after a 63 test acceptance checklist.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Discovery / scoping / consulting; Full time / contract to hire
* Product type: Web app; SaaS platform; Website / landing page; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent; Multi agent system; AI voice agent; AI integration into existing product; AI automation; Document processing / OCR; LLM fine tuning / evaluation; Speech / transcription
* Automation: SMS / WhatsApp messaging
* Workflow type: Outreach / follow up; Appointment booking / scheduling; Customer support; Billing / payments; Reporting / analytics; Data sync across systems; User onboarding / verification
* Industry: Healthcare; Dental
* Compliance / sensitive data: HIPAA / PHI; Confidential / PII data
* CRM and business tools: Twilio
* AI models and platforms: Retell AI
* Tech stack: Node.js; React / Next.js; No code / low code; AI coding tools

## ManyPartsMinistries
* Landing page: https://www.manypartsministries.com/
* System link: https://www.manypartsministries.com/
* Case study link: https://stackupsolutions.com/projects/many-parts-ministries
* Overview: The ManyParts Dashboard is the single system of record for Many Parts Ministries, replacing spreadsheets and disconnected tools. It manages users, roles, enrollments and assessments across thousands of users, with organization hierarchies, coupons and funnel analytics.
* Case study summary: Project: ManyParts Dashboard, the system of record for Many Parts Ministries (Nonprofit).
Problem: Thousands of users, enrollments and assessments were managed across spreadsheets, PDFs and disconnected tools, causing data errors, heavy admin work and constant support tickets.
Solution: We built one central dashboard from the ground up, migrated years of messy historical records and automated the processes around enrollments, organizations and coupons.
Key features: User, role and enrollment management with funnel analytics; three level organization hierarchy with merging; coupon engine; form submission automation; AI Ministry Assistant using RAG.
Technology: React, Redux Toolkit, Node.js, PostgreSQL, OpenAI embeddings, Pinecone, ClickUp and Easyship integrations.
Results: About 70% less admin workload, far fewer data errors and support tickets, and one reliable source of truth.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Bug fixing / debugging; Ongoing maintenance / support; Discovery / scoping / consulting; Full time / contract to hire
* Product type: Web app; Website / landing page; Admin dashboard; Marketplace; API / backend service
* AI capability: AI powered; AI agent; AI automation
* Automation: Workflow automation; Email automation
* Workflow type: Billing / payments
* Industry: E-commerce / retail; Education
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: Node.js; React / Next.js; PostgreSQL

## GlowUpHub
* Landing page: https://www.glowuphub.com.au/
* Overview: A multi tenant AI knowledge assistant SaaS for salons and beauty businesses in Australia. Owners upload SOPs, price lists, training materials and policies, staff get instant answers from their phones with the source document shown, and unanswered questions are flagged so the owner can fill knowledge gaps.
* Case study summary: Project: GlowUpHub, a multi tenant AI knowledge assistant SaaS for salons and beauty businesses in Australia (Beauty and Wellness).
Problem: Salon owners were the bottleneck in their own business, constantly interrupted by staff questions, and every new hire took weeks of the owner's time to onboard.
Solution: We built the MVP as build partner: owners upload their documents and staff get instant, sourced answers from an AI assistant on their phones.
Key features: Isolated workspace per salon with roles; document upload and RAG pipeline; staff chat with source attribution; fallback answers flagged to the owner to close gaps; Stripe plans and analytics.
Technology: React.js, Node.js, PostgreSQL with row level security, Qdrant, Anthropic Claude, Stripe, Figma.
Results: Setup in under 10 minutes, owners freed from repeat questions, faster onboarding and a knowledge base that improves as gaps are flagged.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app; SaaS platform; Website / landing page; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent; Multi agent system; RAG / knowledge base; Chatbot; AI integration into existing product; AI automation; Document processing / OCR; LLM fine tuning / evaluation; Content generation
* Automation: Web scraping / data pipelines; Email automation
* Workflow type: Reporting / analytics; User onboarding / verification; Role based access / permissions; Internal knowledge search
* Industry: Beauty / salon
* Compliance / sensitive data: Security focused
* CRM and business tools: Twilio; Stripe
* AI models and platforms: OpenAI / ChatGPT; Claude
* Tech stack: Node.js; React / Next.js; PostgreSQL

## Rock County Sealcoat automation
* Landing page: https://www.rockcountysealcoat.com/
* System link: https://crm.rockcountysealcoat.com/
* Overview: An end to end automation platform for a sealcoating company, from the first call to the completed job. An AI phone agent captures leads 24/7 into Bitumio CRM, and an admin dashboard handles weather aware scheduling, customer confirmations, automated notifications and live GPS tracking.
* Case study summary: Project: Business automation platform for Rock County Sealcoat, an asphalt sealcoating company (Construction, Home Services).
Problem: The company paid $400 a month for a phone service it did not control, and scheduling crews, confirming customers, handling weather delays and sharing arrival times were all manual.
Solution: We built an owned AI phone agent plus an operations platform that takes each job from the first call to completion.
Key features: 24/7 AI receptionist with call routing and lead intake; two way Bitumio CRM sync; weather aware scheduling and route optimization; automated SMS and email confirmations with backfill; live GPS tracking portal.
Technology: Retell AI, Twilio, ElevenLabs, Bitumio API, Linxup GPS, Google Maps Distance Matrix API.
Results: Every call answered, structured leads created automatically, and an estimated running cost of about $65 to $105 a month instead of $400.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app; Website / landing page; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent; Multi agent system; AI voice agent; RAG / knowledge base; AI automation; Document processing / OCR; Speech / transcription; Predictive / ML models
* Automation: Workflow automation; Email automation; SMS / WhatsApp messaging
* Workflow type: Lead generation / enrichment; Outreach / follow up; Appointment booking / scheduling; Reporting / analytics; Data sync across systems
* Industry: Construction
* Compliance / sensitive data: Security focused
* CRM and business tools: CRM (any)
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: Node.js; React / Next.js; PostgreSQL

## SargeAI
* Landing page: https://sarge.com/
* Case study link: https://stackupsolutions.com/projects/sarge-ai
* Staging link: https://sargeai.stackupsolutions.co/
* Overview: A jurisdiction aware AI legal intelligence platform on web, iOS and Android that helps law enforcement officers find approved legal authority and draft court ready affidavits. Answers come only from approved case law, statutes and department policies, with citations on every source.
* Case study summary: Project: Sarge AI, a jurisdiction aware AI legal intelligence platform for law enforcement (Legal, Public Safety).
Problem: Officers needed fast, reliable legal authority and court defensible affidavits, but general AI tools hallucinate and cannot be trusted for legal decisions.
Solution: We built a secure web and mobile platform that answers only from approved case law, statutes and department policies, cites every source and helps draft affidavits without changing officer facts.
Key features: Strict RAG gating with citations and refusals; guided affidavit workflow with probable cause checks; voice and text chat; single tenant department isolation with document approval; immutable CJIS aligned audit logs.
Technology: RAG pipeline, web app, iOS and Android apps, OTP and biometric onboarding, role based access.
Results: Delivered over 6+ months and prepared for a 5 department pilot, giving officers cited, trustworthy answers and gap checked affidavit drafts.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app; SaaS platform; Mobile app; Website / landing page; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent; Multi agent system; AI voice agent; RAG / knowledge base; Chatbot; Document processing / OCR; LLM fine tuning / evaluation; Content generation; Speech / transcription
* Automation: Workflow automation
* Workflow type: Customer support; Billing / payments; Reporting / analytics; Role based access / permissions; Internal knowledge search
* Industry: Legal
* Compliance / sensitive data: HIPAA / PHI; GDPR; Security focused; Confidential / PII data
* CRM and business tools: Stripe
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: Node.js; React / Next.js

## Seller Genius AI
* Landing page: https://sellergeniusai.com/
* Case study link: https://stackupsolutions.com/projects/seller-genius-ai
* Staging link: https://sellergenius.stackup.solutions/
* Overview: A multi tenant SaaS platform that replaces manual cold calling for realtors and small brokerages with AI voice agents. Agents set up their own AI caller, import leads, and the system qualifies leads, books appointments and follows up automatically.
* Case study summary: Project: Seller Genius AI, a multi tenant AI voice calling SaaS for realtors and small brokerages (Real Estate).
Problem: Agents spent hours each day cold calling leads manually, and many leads were lost because follow ups did not happen on time.
Solution: We built a platform where each agent sets up a personalized AI caller that qualifies leads, books appointments and follows up automatically.
Key features: Personalized AI caller setup; lead import by form or Excel; queue driven outbound call engine with retries; GPT-4 call summaries; Google Calendar booking and dashboards.
Technology: React, Node.js, PostgreSQL, AWS, SignalWire, GPT-4, Google Calendar, Stripe.
Results: 1 to 2 hours saved per agent per day, 15 to 35% more booked appointments and 10 to 30% fewer lost leads.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app; SaaS platform; Website / landing page; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent; Multi agent system; AI voice agent; RAG / knowledge base; AI integration into existing product; AI automation; Document processing / OCR; LLM fine tuning / evaluation; Speech / transcription
* Automation: Workflow automation
* Workflow type: Lead generation / enrichment; Outreach / follow up; Appointment booking / scheduling; Billing / payments; Reporting / analytics; User onboarding / verification
* Industry: Real estate
* CRM and business tools: Google Workspace; Stripe
* AI models and platforms: OpenAI / ChatGPT; LangChain / LangGraph
* Tech stack: Node.js; React / Next.js; PostgreSQL

## Orionlease
* System link: https://orionlease.vectorpointai.com/login
* Overview: An AI document intelligence platform for a commercial real estate acquisition group that turns long, complex leases into structured acquisition data. It runs OCR on scanned files, extracts a defined lease schema with Claude, and keeps every field traceable and human approved.
* Case study summary: Project: Orion Lease, an AI lease document intelligence platform for a commercial real estate acquisition group (Real Estate).
Problem: Critical lease terms were buried in long PDFs and amendments and had to be checked against non standard broker spreadsheets, so each project review took 3 to 5 days.
Solution: We built a human in the loop platform that extracts a defined lease schema, flags risky clauses and reconciles leases against broker data before a reviewer approves the final abstract.
Key features: OCR for scanned leases; schema extraction with value, source and confidence; red flag clause analysis; Green, Yellow and Red broker variance checks; confirm, correct or flag review and standard exports.
Technology: React, FastAPI, PostgreSQL, Celery and Redis, Claude on AWS Bedrock, Azure Document Intelligence.
Results: Built to compress a 3 to 5 day review across portfolios of 90+ properties, with every final abstract human approved; currently in pilot.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Discovery / scoping / consulting; Full time / contract to hire
* Product type: Web app; Website / landing page; Admin dashboard; Internal tool; API / backend service
* AI capability: AI powered; AI agent; Multi agent system; RAG / knowledge base; AI integration into existing product; AI automation; Document processing / OCR; LLM fine tuning / evaluation; Content generation; Speech / transcription; Predictive / ML models
* Automation: Workflow automation; Web scraping / data pipelines
* Workflow type: Claims / approvals / exceptions; Reporting / analytics; Role based access / permissions
* Industry: Real estate
* Compliance / sensitive data: Security focused; Confidential / PII data
* AI models and platforms: OpenAI / ChatGPT; Claude; LangChain / LangGraph
* Tech stack: Node.js; React / Next.js

## Innspeed
* Landing page: https://innspeed.com/
* System link: https://innspeed.com/
* Staging link: https://app-innspeed.stackup.solutions/
* Overview: A self serve B2B SaaS platform that gives independent and boutique hotels in Europe an AI guest communications layer they can launch in under fifteen minutes. Hotels embed an AI chat widget and connect WhatsApp Business, and the platform answers guests in six languages, hands sensitive conversations to staff and runs automated campaigns from one inbox.
* Case study summary: Project: Innspeed, a self serve AI guest communications SaaS for boutique hotels in Europe (Hospitality).
Problem: Small hotels get guest questions around the clock in many languages across web and WhatsApp, but enterprise tools need sales calls, integrations and IT teams they do not have.
Solution: We built a multi tenant platform hotels set up themselves, where AI answers guests in six languages from one knowledge base and hands sensitive conversations to staff.
Key features: One line embeddable chat widget; direct WhatsApp Business integration; unified real time inbox; auto built multilingual knowledge base; confidence based handoff and automated campaigns.
Technology: Next.js 14, Fastify, Supabase, pgvector, Claude API, Cohere, Meta WhatsApp Cloud API, Stripe, Resend.
Results: Signup to live AI in under fifteen minutes, six languages from one knowledge base, and GDPR and EU AI Act readiness built in.
* Project stage: MVP; New build (from scratch); Discovery / scoping / consulting; Full time / contract to hire
* Product type: Web app; SaaS platform; Website / landing page; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent; RAG / knowledge base; Chatbot; AI automation; Document processing / OCR; Content generation; Speech / transcription
* Automation: Web scraping / data pipelines; SMS / WhatsApp messaging
* Workflow type: Outreach / follow up; Customer support; Billing / payments; Reporting / analytics; User onboarding / verification; Role based access / permissions; Search / matching; Internal knowledge search
* Industry: Hospitality
* Compliance / sensitive data: GDPR; Security focused
* CRM and business tools: Twilio; Stripe
* AI models and platforms: Claude
* Tech stack: Node.js; React / Next.js; Supabase / Firebase; PostgreSQL

## Apex
* System link: https://crm.apexwindowstx.com/
* Overview: An AI CRM and job operations platform for Apex Windows, a window repair and replacement company. A Retell AI voice agent, OpenAI chatbot and web form capture every lead, and the CRM runs estimates, measurements, scheduling, QuickBooks payments, an installer mobile app and Google review requests.
* Case study summary: Project: AI CRM and job operations platform for Apex Windows, a window repair and replacement company (Home Services).
Problem: Leads were lost to missed calls and incomplete details, estimates lacked follow up, and scheduling, deposits and contractor payouts were spread across calls, emails and QuickBooks.
Solution: We built AI lead intake in Phase 1 and extended it in Phase 2 into one platform that runs every job from inquiry to installation, payment and review.
Key features: Retell AI voice agent, chatbot and web form; unified CRM with call logs and chats; estimates and field forms with staged follow ups; QuickBooks deposit and final invoicing; role based installer mobile app.
Technology: React, Node.js, Express, PostgreSQL, React Native, Retell AI, OpenAI, QuickBooks, SendGrid, Twilio, OneSignal, Google Places API.
Results: Every lead captured in one place, follow ups automated, invoices generated through QuickBooks, and installers working from a mobile app.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Bug fixing / debugging; Ongoing maintenance / support; Discovery / scoping / consulting; Full time / contract to hire
* Product type: Web app; Mobile app; Admin dashboard
* AI capability: AI powered; AI agent; AI voice agent; Chatbot; AI automation; Speech / transcription
* Automation: Workflow automation; GoHighLevel; Email automation; SMS / WhatsApp messaging
* Workflow type: Lead generation / enrichment; Outreach / follow up; Appointment booking / scheduling; Customer support; Billing / payments; Reporting / analytics; Data sync across systems; Role based access / permissions
* Industry: Home services
* CRM and business tools: CRM (any); Twilio
* AI models and platforms: OpenAI / ChatGPT; Retell AI
* Tech stack: MongoDB

## Doctoria
* Landing page: https://doctoria.do/
* Overview: Doctoria is a two sided healthcare marketplace for the Dominican Republic that connects patients with verified doctors. Patients search doctors by specialty, price and insurance, send appointment requests and chat in real time, while doctors are verified and manage requests from their dashboard.
* Case study summary: Project: Doctoria, a two sided healthcare marketplace for the Dominican Republic (Healthcare).
Problem: Patients had no easy way to find verified doctors by specialty, price and insurance, and doctors lacked a simple channel to receive and manage appointment requests.
Solution: We took Doctoria from idea to a live marketplace connecting patients with verified doctors through search, appointment requests and real time chat.
Key features: Doctor search by specialty, price, availability and insurance; appointment requests and real time chat with file sharing; document based doctor verification; freemium to Stripe subscription plans; moderated reviews from real appointments.
Technology: React, Node.js, PostgreSQL, Socket.IO, Stripe, English and Spanish.
Results: A live bilingual marketplace with verified doctors, monetized through subscriptions and governed by a Super Admin layer.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app; Website / landing page; Admin dashboard; Marketplace; API / backend service
* AI capability: AI powered; AI agent; Multi agent system; RAG / knowledge base; Chatbot; Document processing / OCR; LLM fine tuning / evaluation
* Automation: Workflow automation
* Workflow type: Lead generation / enrichment; Appointment booking / scheduling; Billing / payments; User onboarding / verification; Role based access / permissions; Search / matching
* Industry: Healthcare
* Compliance / sensitive data: Security focused; Confidential / PII data
* AI models and platforms: OpenAI / ChatGPT; LangChain / LangGraph
* Tech stack: Node.js; React / Next.js

## CaboAirportShuttle
* Landing page: https://caboairportshuttle.net/
* Mobile link: https://play.google.com/store/apps/details?id=com.caboairportshuttle
* Staging link: https://staging.zeo.mx
* Overview: A real time mobile and web operations platform for Cabo Airport Shuttle that replaced Google Sheets. It coordinates 150+ airport transfers a day across drivers, representatives and admins, with QR code ride verification and live status updates.
* Case study summary: Project: Real time operations platform for Cabo Airport Shuttle (Transportation, Logistics).
Problem: Daily airport transfers were coordinated in Google Sheets, leading to missed rides, slow payment reconciliation and little visibility into drivers and vehicles.
Solution: We built mobile and web apps that coordinate bookings, drivers, representatives, mechanics and admins in real time.
Key features: QR code ride verification; live ride assignment and status updates; driver hours, payments and tips logging; vehicle maintenance tracking; admin overrides with audit trail and Google Sheets sync.
Technology: React Native, Laravel, MySQL, Pusher, OneSignal, JWT.
Results: Launched in 3 months and scaled over 2+ years to coordinate 150+ transfers a day across 70+ staff, with far fewer missed rides and faster payment reconciliation.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app; Mobile app; Website / landing page; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent; RAG / knowledge base; AI integration into existing product; AI automation
* Automation: Workflow automation; Email automation; SMS / WhatsApp messaging
* Workflow type: Appointment booking / scheduling; Billing / payments; Reporting / analytics; Data sync across systems
* Industry: Logistics
* Compliance / sensitive data: GDPR
* CRM and business tools: Stripe
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: React / Next.js; PHP / Laravel

## Fierana (Women Learning Platform)
* Staging link: https://fierana.stackupsolutions.co/
* Overview: A subscription learning and coaching platform for women that places each member on a personalized pathway through onboarding assessments. It delivers video lessons, live Zoom classes, practice tracking, belt based gamification, community access and personalized email journeys, with Stripe billing.
* Case study summary: Project: Fierana, a subscription learning and coaching platform for women (Education).
Problem: Generic onboarding ignored each member's level and goals, and content, live classes and community lived in separate tools, making engagement hard to sustain.
Solution: We built one platform that personalizes each member's pathway from onboarding and connects lessons, classes, practice, community and communication.
Key features: Archetype and pathway assessment onboarding; LMS with 6 pathways, 5 levels and 100+ videos; live Zoom class booking; belts, badges, streaks and challenges; 8+ automated email journeys.
Technology: Stripe Billing, Zoom API, SendGrid, Vimeo and AWS S3, Mighty Networks SSO.
Results: Personalized learning from day one, automated engagement that reaches members before they drift away, and clear subscription and MRR insights for admins.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app; SaaS platform; Website / landing page; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent
* Automation: Workflow automation; Email automation
* Workflow type: Outreach / follow up; Appointment booking / scheduling; Billing / payments; Reporting / analytics; Data sync across systems; User onboarding / verification; Role based access / permissions; Search / matching
* Industry: Education
* Compliance / sensitive data: Security focused
* CRM and business tools: Stripe
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: React / Next.js; PHP / Laravel

## Tolba
* Overview: A privacy first, women only matchmaking app for serious marriage in the Middle East, built in Flutter for iOS and Android with a React admin portal. Every member is ID verified, applications stay anonymous until a mutual identity reveal, and real time chats are time bound and automatically moderated in Arabic and English.
* Case study summary: Project: Tolba, a privacy first, women only matchmaking app for serious marriage in the Middle East (Social).
Problem: The region lacked a culturally aligned, verification first platform where compatibility could be judged before appearance and conversations stayed safe.
Solution: We built bilingual mobile apps, an admin portal and a backend where every member is ID verified, applications stay anonymous and identities are revealed only by mutual agreement.
Key features: Admin reviewed ID and selfie verification; anonymous applications with 14 preference dimensions; real time time bound chat; automatic moderation of phone numbers and offensive words; mutual identity reveal.
Technology: Flutter, React, Node.js, Express, Socket.IO, PostgreSQL, AWS S3, Firebase Cloud Messaging.
Results: A fully verified community, anonymity enforced server side, safer conversations through automatic pause and reporting, and a native Arabic experience.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Mobile app; Website / landing page; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent
* Workflow type: Appointment booking / scheduling; Billing / payments; Reporting / analytics; User onboarding / verification; Role based access / permissions; Search / matching
* Industry: Social
* Compliance / sensitive data: Security focused; Confidential / PII data
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: Node.js; Supabase / Firebase

## Taleroo
* Landing page: https://app.taleroo.io/
* Overview: A multi tenant AI career integration SaaS that helps migrants, refugees and job seekers in Germany reach funded training, coaching and language programs. A multilingual AI intake builds personal career strategies and matches users to eligible programs and providers.
* Case study summary: Project: Taleroo, a multi tenant AI career integration SaaS for migrants, refugees and job seekers in Germany (Education, Employment).
Problem: Career guidance was fragmented, funding eligibility rules were complex, and education providers carried heavy manual workload with little transparency for students.
Solution: We built a platform where multilingual AI intake creates personal career strategies, deterministic rules validate funding eligibility, and students and providers work in one hub.
Key features: Six language conversational intake; AI career strategies across funded programs; Red, Yellow and Green eligibility scoring with moderation; student hub with videos, tasks, bookings and chat; provider tools for courses, contracts and audits.
Technology: Next.js, Flask, PostgreSQL, Firebase, AWS, PostHog, Kaltura, Stream.io.
Results: Delivered in about 6 months as a live platform, giving students clear funded pathways and cutting provider admin work.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Extend existing product; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app; SaaS platform; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent
* Automation: Workflow automation; Email automation
* Workflow type: Claims / approvals / exceptions; Reporting / analytics; Data sync across systems; User onboarding / verification
* Industry: Recruitment / HR
* Compliance / sensitive data: Confidential / PII data
* CRM and business tools: CRM (any)
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: Python; React / Next.js

## AI heritage fence voice agent
* Case study link: https://stackupsolutions.com/projects/ai-voice-agent
* Staging link: https://dashboard-fence.stackup.solutions
* Overview: A 24/7 AI voice agent for a nationwide US fencing company that answers, qualifies and books every inbound call across all US time zones. It routes emergencies to a human line, books live appointments without double booking, sends SMS and email confirmations, and gives managers a dashboard of calls and bookings.
* Case study summary: Project: 24/7 AI voice agent for a nationwide US fencing company (Home Services).
Problem: Calls were handled by salesmen or voicemail, so peak hour and after hours calls were missed, emergency jobs were lost and office staff were overloaded.
Solution: We built an AI voice agent that answers, qualifies, schedules and escalates every inbound call across all US time zones.
Key features: Emergency detection and escalation; live booking with a double booking rule engine; structured estimate intake; SMS and email reminders with round robin salesman assignment; admin dashboard with call logs.
Technology: Retell AI, React, Node.js, PostgreSQL, AWS, SendGrid.
Results: 80% call pickup rate, 30% more booked appointments, 2 to 3 hours saved per day for office staff and no emergency jobs lost to voicemail.
* Project stage: New build (from scratch)
* Product type: Web app; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent; Multi agent system; AI voice agent; AI automation; LLM fine tuning / evaluation; Speech / transcription
* Automation: Email automation; SMS / WhatsApp messaging
* Workflow type: Lead generation / enrichment; Appointment booking / scheduling; Customer support; Reporting / analytics; Role based access / permissions
* Industry: Home services
* Compliance / sensitive data: Security focused
* CRM and business tools: Twilio; Stripe
* AI models and platforms: OpenAI / ChatGPT; ElevenLabs; Retell AI
* Tech stack: Node.js; React / Next.js; PostgreSQL

## Verify Script
* Case study link: https://stackupsolutions.com/projects/verify-script
* Staging link: https://verifyscript.stackup.solutions/
* Overview: VerifyScript is a monetized AI web app, launched in six weeks, that helps patients, caregivers and providers find hidden risks across multiple medications. Users enter or photograph their medications, and AI flags drug and food interactions in clear, shareable reports.
* Case study summary: Project: VerifyScript, a monetized AI medication safety web app (Healthcare).
Problem: Patients and caregivers managing multiple medications had no simple way to spot dangerous interactions, cascades or recalls.
Solution: We built and launched in 6 weeks an app that turns typed or photographed medication lists into a clear interaction report.
Key features: Photo or manual entry with OCR and RxNorm normalization; AI interaction, cascade and deprescribing analysis; safety guardrails; branded PDF report emailed automatically; Stripe payment before analysis.
Technology: React, Node.js, Express, OpenAI GPT-4, Google Vision OCR, RxNorm, Puppeteer, Gmail API, Stripe.
Results: Launched in 6 weeks and signed its first paying users within the launch window.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app
* AI capability: AI powered; AI agent; Document processing / OCR; Content generation; Speech / transcription
* Automation: Workflow automation; Email automation
* Workflow type: Billing / payments
* Industry: Healthcare
* Compliance / sensitive data: Confidential / PII data
* CRM and business tools: Stripe
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: Node.js; React / Next.js

## Image Summary App
* Case study link: https://stackupsolutions.com/projects/image-summary
* Overview: A multilingual AI accessibility app for iOS and Android that helps Pashto, Dari and English speakers understand documents from a photo. It runs OCR, writes a short plain language summary and reads it aloud, delivered in three weeks.
* Case study summary: Project: Multilingual AI accessibility app for Pashto, Dari and English speakers (Accessibility).
Problem: Users struggled to understand documents in other languages and depended on human translators.
Solution: We delivered in 3 weeks an iOS and Android app that summarizes a photographed document in plain language and reads it aloud.
Key features: Language selection; guided capture and crop; OCR; short AI summaries; text to speech playback with no sign up or stored data.
Technology: React Native, Redux, OpenAI gpt-4o-mini, OpenAI text to speech, OCR.
Results: Delivered in 3 weeks as a fast, private, low cost app that reduces reliance on human translators.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Extend existing product; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Mobile app; API / backend service
* AI capability: AI powered; AI agent; AI voice agent; Document processing / OCR; LLM fine tuning / evaluation; Content generation; Speech / transcription
* Industry: Hospitality
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: Node.js; React / Next.js; MongoDB

## Paddlewar
* System link: https://app.paddlewar.org/
* Case study link: https://stackupsolutions.com/projects/paddle-war
* Overview: A multi tenant league management platform for paddle and racket sports that has run in production for over two years. It replaces spreadsheets with role based access for players, admins and facilities, plus a custom scheduling engine for balanced league schedules.
* Case study summary: Project: PaddleWar, a multi tenant league management platform for paddle and racket sports (Sports).
Problem: Independent leagues ran scheduling, payments and ratings on spreadsheets, creating heavy admin work and low trust in schedules.
Solution: We built a production platform with automated scheduling, payments and ratings that has run for over two years.
Key features: Tenant isolation and role based access; custom scheduling engine for home and away, courts and rest periods; Stripe memberships with refunds; automated notifications; AI rating recalculation after each match.
Technology: Laravel, InertiaJS, Stripe, Google SMTP, external AI rating engine.
Results: No more spreadsheet scheduling or payments, lower admin overhead, more player trust and growth without adding staff.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app; Website / landing page; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent
* Workflow type: Appointment booking / scheduling; Billing / payments; User onboarding / verification; Search / matching
* Industry: Sports
* Compliance / sensitive data: Security focused
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: PHP / Laravel

## Playpickleball
* System link: https://playpickleballsoftware.com/playpickleball
* Case study link: https://stackupsolutions.com/projects/pickleball-app
* Overview: A multi tenant tournament management SaaS for pickleball organizations. It handles player and team registration, payments and a round robin scheduling engine that builds full league schedules in under a minute based on availability and courts.
* Case study summary: Project: PlayPickleball, a multi tenant tournament management SaaS (Sports).
Problem: Sports organizations spent hours building schedules and managing registrations and payments by hand.
Solution: We built a platform that automates registration, payments, scheduling and standings for every organization.
Key features: Round robin scheduling engine that builds full schedules in under a minute; online registration and Stripe payments; isolated company dashboards; role based access; live standings and revenue reports.
Technology: Laravel, Bootstrap, MySQL, Stripe, Google SMTP.
Results: 80% less scheduling time, 50% less admin workload, 100+ tournaments, 5,000+ players and $1,500+ revenue per tournament.
* Project stage: New build (from scratch); Prototype / proof of concept; Discovery / scoping / consulting; Full time / contract to hire
* Product type: Web app; SaaS platform; Website / landing page; Admin dashboard; API / backend service
* AI capability: AI agent; RAG / knowledge base; AI automation; Document processing / OCR
* Automation: Email automation; SMS / WhatsApp messaging
* Workflow type: Appointment booking / scheduling; Customer support; Billing / payments; Reporting / analytics; Data sync across systems; User onboarding / verification; Role based access / permissions; Search / matching
* Industry: Sports
* Compliance / sensitive data: GDPR; Security focused
* CRM and business tools: Google Workspace
* AI models and platforms: OpenAI / ChatGPT; Claude

## OnDemandPsych
* System link: https://copilot.ondemandpsych.com/
* Case study link: https://stackupsolutions.com/projects/on-demand-psych
* Overview: A HIPAA ready AI psychopharmacology platform that helps psychiatrists build safer medication treatment plans in minutes. It answers from curated medical texts through RAG with an AI validation step and auditable outputs, alongside patient chats and subscription billing.
* Case study summary: Project: HIPAA ready AI psychopharmacology platform for psychiatrists (Healthcare).
Problem: Psychiatrists spent long sessions building medication plans, with high risk of interaction errors and no trustworthy AI support.
Solution: We built a RAG based clinical assistant that grounds answers in curated medical texts with validation and audit logging.
Key features: RAG over curated texts with citations; AI validation agent; multithreaded patient chats with SOAP and plan templates; interaction and polypharmacy alerts; ICD-10 and DSM-5-TR mapping.
Technology: Next.js, Laravel, GPT-4, Pinecone, AES-256 encryption, JWT, Stripe.
Results: 10 to 18 minutes saved per consultation, 25 to 40% less workflow time and 15 to 30% fewer medication related errors.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app; SaaS platform; Admin dashboard; API / backend service
* AI capability: AI powered; RAG / knowledge base; Chatbot; Content generation; Speech / transcription
* Workflow type: Billing / payments; Role based access / permissions
* Industry: Healthcare
* Compliance / sensitive data: HIPAA / PHI; Confidential / PII data
* CRM and business tools: Stripe
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: Python; React / Next.js; PostgreSQL

## Puppeteer
* Landing page: https://getpuppeteer.com/
* Case study link: https://stackupsolutions.com/projects/puppeteer
* Overview: A mobile first, multi tenant ticketing platform that gives event organizers control from ticket sales to gate entry. Organizers allocate tickets to sellers, track live sales and revenue, and scan tickets at the gate.
* Case study summary: Project: Puppeteer, a mobile first, multi tenant event ticketing platform (Events).
Problem: Organizers struggled to control ticket allocation across sellers, track sales live and stop duplicate tickets at the gate.
Solution: We built mobile and web apps that manage tickets from allocation and sales to gate entry.
Key features: Ticket allocation to sellers with live stock; real time sales charts; in app restock requests with push alerts; one time QR codes with server side invalidation; daily sales reports.
Technology: React Native, Laravel, MySQL, VueJS admin, WebSockets, OneSignal.
Results: Faster entry, no duplicate ticket use, real time revenue visibility and actionable post event insights.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Mobile app; Website / landing page; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent
* Automation: Email automation
* Workflow type: Reporting / analytics; Role based access / permissions; Inventory / orders
* Industry: Event management
* Compliance / sensitive data: Security focused
* CRM and business tools: CRM (any)
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: React / Next.js; PHP / Laravel

## Glass Doctor
* System link: https://glassdoctorohio.com/
* Case study link: https://stackupsolutions.com/projects/glass-doctor
* Overview: A secure internal AI knowledge assistant for Glass Doctor that gives employees instant answers from company policies, procedures and training documents. Admins upload files, OCR handles scanned pages, and a RAG pipeline keeps answers limited to approved material.
* Case study summary: Project: Internal AI knowledge assistant for Glass Doctor (Home Services).
Problem: Policies, procedures and training documents were scattered, so employees waited on calls and senior staff were constantly interrupted.
Solution: We built a secure assistant that answers employee questions only from approved company documents.
Key features: Document upload with OCR; RAG answers that decline when nothing relevant exists; role based access; in app document viewer and chat history; audit logs and usage dashboard.
Technology: Next.js, Node.js, MySQL, Pinecone, ChatGPT, JWT.
Results: Answers in seconds instead of calls, far fewer interruptions for senior staff and faster onboarding for new hires.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app; Website / landing page; Admin dashboard; Internal tool; API / backend service
* AI capability: AI powered; AI agent; RAG / knowledge base; Chatbot; AI integration into existing product; Document processing / OCR; Speech / transcription; Predictive / ML models
* Automation: Web scraping / data pipelines; Email automation; SMS / WhatsApp messaging
* Workflow type: Reporting / analytics; Role based access / permissions; Internal knowledge search
* Industry: Home services
* Compliance / sensitive data: Security focused
* CRM and business tools: Stripe
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: Node.js; React / Next.js; MongoDB

## Bitrix24
* Case study link: https://stackupsolutions.com/projects/bitrix24
* Overview: An AI WhatsApp support system for a residential property operator that answers tenant questions automatically. Tenants are identified by booking ID or phone, and answers come from apartment documents and live Bitrix24 CRM data, with handover to staff when needed.
* Case study summary: Project: AI WhatsApp support system for a residential property operator (Real Estate, Hospitality).
Problem: Support staff answered the same tenant questions repeatedly, with spikes at check in and check out.
Solution: We built a WhatsApp assistant that identifies tenants and answers from their apartment documents and live CRM data.
Key features: Tenant identification by booking ID or phone; apartment specific RAG answers; Bitrix24 CRM data fallback; escalation on failed verification or frustration; manual and automatic chat modes.
Technology: Node.js, MySQL, AWS, GPT-4o, Pinecone, Bitrix24 CRM, Meta WhatsApp Business API, React.
Results: About 90% of tenant queries resolved automatically, replies in 5 to 10 seconds and human support reduced to exceptions.
* Project stage: New build (from scratch); Bug fixing / debugging; Ongoing maintenance / support; Discovery / scoping / consulting; Full time / contract to hire
* Product type: Web app; Admin dashboard
* AI capability: AI powered; RAG / knowledge base; Chatbot; AI automation; Document processing / OCR; Content generation
* Automation: n8n; Make.com; Web scraping / data pipelines; Email automation; SMS / WhatsApp messaging
* Workflow type: Customer support; Data sync across systems; Search / matching; Internal knowledge search; Project / task management
* Industry: Hospitality
* Compliance / sensitive data: Security focused
* CRM and business tools: CRM (any)
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: Node.js; React / Next.js; PostgreSQL

## Chairboss
* Landing page: https://chairboss.io/
* Mobile link: Android: http://play.google.com/store/apps/details?id=com.empactappsllc.chairboss
iOS: https://apps.apple.com/us/app/chairboss/id6752791542
* Overview: An AI powered booking and business management platform for salons, barbers and other service providers on web and mobile. Clients book by tap, chat or voice, while providers manage services, clients, Stripe Connect payouts, loyalty rewards, partner revenue sharing and analytics.
* Case study summary: Project: ChairBoss, an AI powered booking and business platform for salons and barbers (Beauty).
Problem: Providers lost bookings to slow replies and manual scheduling, had gaps in their calendars and no simple way to share revenue with partner providers.
Solution: We built a platform where clients book by tap, chat or voice and providers run their business, payouts and partnerships in one place.
Key features: Real time booking with conflict prevention; AI chat and voice booking; Smart Gaps scheduling; Stripe Connect payouts and commissions; loyalty tiers and provider revenue sharing.
Technology: React 18, TypeScript, Supabase, PostgreSQL with RLS, OpenAI, ElevenLabs, WebRTC, Stripe Connect.
Results: Faster booking for clients, fuller calendars for providers, automated payouts and a new growth channel through partnerships.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app; SaaS platform; Mobile app; Website / landing page; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent; Multi agent system; AI voice agent; RAG / knowledge base; Chatbot; AI integration into existing product; AI automation; Document processing / OCR; LLM fine tuning / evaluation; Speech / transcription
* Automation: Workflow automation; Email automation
* Workflow type: Appointment booking / scheduling; Customer support; Billing / payments; Reporting / analytics; User onboarding / verification; Role based access / permissions
* Industry: Beauty / salon
* Compliance / sensitive data: Security focused
* CRM and business tools: Google Workspace; Twilio; Stripe
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: Node.js; React / Next.js; Supabase / Firebase; PostgreSQL

## DocTrace.ai
* Staging link: https://doctrace.stackup.solutions/
* Overview: A serverless document ingestion MVP that turns uploaded PDFs into clean, structured JSON using Amazon Textract. Files upload through a FastAPI service, Textract runs asynchronously with SNS callbacks, and normalized output is stored in S3, ready for later AI processing.
* Case study summary: Project: DocTrace, a document ingestion pipeline MVP (Document Intelligence).
Problem: PDFs had to be processed into a clean, consistent structure before any AI analysis could be built on them.
Solution: We built an event driven AWS pipeline that turns uploaded PDFs into normalized JSON using asynchronous Textract processing.
Key features: PDF upload to S3; async Textract analysis for text, forms and tables; SNS callbacks with signature validation; normalized JSON output; modular codebase for Phase 2.
Technology: FastAPI (Python), Amazon Textract, S3, SNS, IAM, boto3, Pydantic.
Results: A complete ingestion pipeline delivered within one week, ready for database, NLP and scoring in the next phase.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Bug fixing / debugging; Ongoing maintenance / support; Discovery / scoping / consulting; Full time / contract to hire
* Product type: Web app; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent; RAG / knowledge base; AI integration into existing product; Document processing / OCR; Predictive / ML models
* Workflow type: Search / matching
* Industry: Legal
* Compliance / sensitive data: Security focused
* AI models and platforms: OpenAI / ChatGPT; LangChain / LangGraph; Azure / AWS AI
* Tech stack: Python

## The Village (IL Borghista)
* Landing page: https://ilborghista.it/
* Overview: A bilingual tourism platform that connects travelers, local businesses and municipalities across Italian villages. Travelers discover villages through maps, search, favorites and curated itineraries, businesses publish free profiles and events instantly, and admins curate and moderate content.
* Case study summary: Project: IL Borghista, a tourism discovery platform for Italian villages (Tourism).
Problem: Travelers had no single place to discover lesser known villages, and small local businesses could not afford visibility to international visitors.
Solution: We built a bilingual platform connecting travelers, local businesses and municipalities through maps, search and curated content.
Key features: Municipality pages, POIs, events and itineraries; global search and map based discovery; free self service business profiles; Enthusiast and Guide submissions with moderation; favorites and notifications.
Technology: React / Next.js, Node.js, PostgreSQL, PostGIS, Meilisearch, Supabase Storage, OneSignal.
Results: Authentic villages made discoverable, free instant visibility for local businesses, and a GDPR ready platform in English and Italian.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Full time / contract to hire
* Product type: Web app; Website / landing page; Admin dashboard; Marketplace; API / backend service
* AI capability: AI powered; RAG / knowledge base; Content generation
* Automation: Web scraping / data pipelines; Email automation
* Workflow type: Claims / approvals / exceptions; Reporting / analytics; Data sync across systems; User onboarding / verification; Role based access / permissions; Search / matching; Internal knowledge search
* Industry: Hospitality
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: Node.js; React / Next.js; PostgreSQL

## ShipperScout
* Staging link: https://shipperscout.stackup.solutions/
* Overview: A freight marketplace MVP that connects shippers with carriers through requests for quote. Shippers post RFQs, a matching engine routes each one to carriers by route and service type, and carrier teams unlock leads with shared credits bought through Stripe.
* Case study summary: Project: ShipperScout, a freight marketplace MVP connecting shippers with carriers (Logistics).
Problem: Shippers contacted carriers one by one, while carriers chased leads outside their routes and services.
Solution: We built a two sided marketplace where each request for quote reaches only matching carriers, who unlock leads with credits.
Key features: Guided RFQ creation; rule based matching by route and service; multi user carrier accounts with shared credits; Stripe subscriptions and credit purchases; admin moderation and monitoring.
Technology: React / Next.js, Node.js, PostgreSQL, Stripe, Sentry.
Results: Faster carrier discovery for shippers, relevant leads only for carriers and revenue from launch through subscriptions and credits.
* Project stage: MVP; New build (from scratch); Full time / contract to hire
* Product type: Web app; SaaS platform; Website / landing page; Admin dashboard; Marketplace; API / backend service
* AI capability: AI powered; AI automation
* Automation: Email automation
* Workflow type: Billing / payments; Reporting / analytics; Data sync across systems; User onboarding / verification; Role based access / permissions; Search / matching; Inventory / orders
* Industry: Logistics
* CRM and business tools: Stripe
* Tech stack: Node.js; React / Next.js; PostgreSQL

## StayPlus
* Landing page: https://stayplusmia.com/
* Overview: A guest upsell engine for a short term rental operator that sells add on services such as early check in, late check out and parking inside each guest's guidebook, using Guesty reservation data and Stripe checkout. The work extended into a rebuilt business website on Strapi CMS and a direct booking website with its own admin panel.
* Case study summary: Project: Upsell engine and direct booking platform for StayPlus, a short term rental operator (Hospitality).
Problem: Add on services were sold informally with no central control or tracking, and the company relied on commission based booking platforms.
Solution: We built a standalone upsell engine that sells eligible services inside each guest's guidebook, then a business website and a direct booking website.
Key features: Service catalog assigned per property; Guesty reservation eligibility checks; Stripe checkout and order tracking; automated guidebook emails; direct booking site with admin panel.
Technology: Laravel, MySQL, Next.js 14, Strapi, PostgreSQL, NextAuth.js, Stripe, Guesty API.
Results: New revenue on every eligible stay, central control of services and pricing, less manual work and a direct booking channel.
* Project stage: MVP; New build (from scratch); Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app; Website / landing page; Admin dashboard; Marketplace; Internal tool; API / backend service
* AI capability: Multi agent system; AI automation
* Automation: Workflow automation; Web scraping / data pipelines; Email automation
* Workflow type: Customer support; Billing / payments; Reporting / analytics; Data sync across systems; User onboarding / verification; Role based access / permissions; Search / matching; Inventory / orders; Project / task management
* Industry: Hospitality
* CRM and business tools: Stripe
* Tech stack: React / Next.js; PHP / Laravel; PostgreSQL

## Breesy
* Landing page: https://www.breesy.ai/
* Overview: Breesy is an AI operating layer for restoration companies that connects calls, intake, field work and revenue. Its products include a 24/7 AI voice agent, AI call capture, revenue and marketing attribution analytics and a storm surge command center, all integrated with the job management, CRM and chat tools teams already use.
* Case study summary: Project: Breesy, an AI operating layer for property restoration companies (Restoration).
Problem: Missed calls lost emergency jobs, call context was scattered across tools, storm surges overwhelmed intake, and leaders could not see where revenue leaked.
Solution: We built a suite of connected AI products that capture every call, turn it into structured jobs and show where work is won or lost.
Key features: Breesy Voice 24/7 AI intake with urgency triage; Breesy Phone call summaries and tasks; Revenue leakage tracking; Marketing Attribution; CAT Command Center for storm surge prioritization.
Technology: AI voice and call intelligence, integrations with JobNimbus, Jobber, Salesforce, HubSpot, QuickBooks, Teams and Slack, SOC 2 Type II.
Results: Breesy reports a 100% answer rate, 30%+ more lead capture and 22%+ more job volume when fully implemented.
* Project stage: Rescue / takeover; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Discovery / scoping / consulting; Full time / contract to hire
* Product type: Web app; SaaS platform; Mobile app; Website / landing page; Admin dashboard; API / backend service
* AI capability: AI powered; AI agent; Multi agent system; AI voice agent; RAG / knowledge base; AI integration into existing product; AI automation; Document processing / OCR; LLM fine tuning / evaluation
* Automation: Workflow automation; Web scraping / data pipelines
* Workflow type: Lead generation / enrichment
* Industry: Real estate
* Compliance / sensitive data: Security focused
* AI models and platforms: OpenAI / ChatGPT; LangChain / LangGraph
* Tech stack: Node.js; React / Next.js

## ZD Law Firm Automation
* Overview: Post filing workflow automation for a Florida bankruptcy law firm. The system reads official bankruptcy forms, generates Suggestion of Bankruptcy pleadings for pending state cases, pre drafts reaffirmation requests to lenders and calendars statutory deadlines, with fail closed validation and paralegal review built in.
* Case study summary: Project: Post filing automation for a Florida consumer bankruptcy law firm (Legal).
Problem: Paralegals read every filing, drafted pleadings, emailed lenders and tracked deadlines by hand, supported by hard to maintain Zapier reminders.
Solution: We built two automation engines that read official bankruptcy forms and prepare pleadings and lender requests, with fail closed validation and paralegal review.
Key features: Form 107 extraction for pending lawsuits; Florida case number and court validation; automatic Suggestion of Bankruptcy pleadings; Form 108 reaffirmation requests; Rule 4008 deadline calendaring.
Technology: Cloudflare Workers, PDF extraction with OCR confidence checks, Lawcus, Google Drive, Sheets and Calendar APIs.
Results: Pleadings prepared automatically, no filing built on unverified data, deadlines calculated automatically and legacy Zaps replaced by one pipeline.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Discovery / scoping / consulting; Full time / contract to hire
* Product type: Web app; Admin dashboard; Internal tool; API / backend service
* AI capability: AI powered; AI agent; AI voice agent; RAG / knowledge base; Chatbot; AI automation; Document processing / OCR; Content generation
* Automation: Workflow automation; Make.com; Zapier; GoHighLevel; Email automation
* Workflow type: Appointment booking / scheduling; Customer support; Data sync across systems
* Industry: Legal
* Compliance / sensitive data: Security focused; Confidential / PII data
* CRM and business tools: CRM (any); Google Workspace
* AI models and platforms: Claude
* Tech stack: AI coding tools

## 10-4 Global
* Landing page: https://10-4global.com/
* Overview: An ongoing technology engagement with 10-4 Global, a US third party logistics provider for FTL, LTL, automotive and multimodal freight. Work covers its quote driven website, the ShipMyCar car shipping platform with distance based pricing and Stripe subscriptions, an AI voice agent on Twilio and Retell AI for load posting calls, and an in house TMS replacing Quote Factory.
* Case study summary: Project: Technology partnership with 10-4 Global, a US third party logistics provider (Logistics).
Problem: Shippers wanted instant online quotes, load posting calls needed answering at any hour, and core operations depended on a third party TMS.
Solution: We built online quoting and a car shipping platform, an AI voice line for load postings, and an in house TMS to replace Quote Factory.
Key features: Quote flows for FTL, LTL, automotive and multimodal freight; distance based pricing with subscriptions; Stripe payments and admin content control; Twilio and Retell AI voice agent; in house TMS.
Technology: Laravel, Bootstrap, jQuery, MySQL, Stripe, mapping APIs, Twilio, Retell AI.
Results: Instant online estimates, carrier calls answered by AI and a clear path off third party software.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Extend existing product; Rebuild / migration; Bug fixing / debugging; Ongoing maintenance / support; Discovery / scoping / consulting; Full time / contract to hire
* Product type: Web app; Website / landing page; Admin dashboard; Internal tool; API / backend service
* AI capability: AI powered; AI agent; AI voice agent; AI integration into existing product; AI automation; Speech / transcription
* Automation: Workflow automation; n8n; GoHighLevel; Web scraping / data pipelines
* Workflow type: Customer support; Billing / payments; Data sync across systems
* Industry: Logistics; Automotive
* Compliance / sensitive data: Security focused
* CRM and business tools: Twilio; Stripe
* Tech stack: PHP / Laravel

## Dealsmart
* Landing page: https://dealsmartai.com/
* Case study link: https://stackupsolutions.com/projects/dealsmart
* Overview: Deals Smart AI is a multi tenant SaaS platform for car dealerships that turns missed and dormant leads into booked appointments. It syncs leads and inventory from dealer CRMs and runs AI conversations over SMS and email, with Stripe billing and performance reporting.
* Case study summary: Project: Deals Smart AI, a multi tenant lead engagement SaaS for car dealerships (Automotive).
Problem: Dealerships missed and neglected leads because BDC teams could not respond fast enough without adding headcount.
Solution: We built a platform that runs AI conversations over SMS and email to turn missed and dormant leads into booked appointments.
Key features: Real time CRM lead and intent sync; inventory sync; campaign templates for lease expiry, dormant and high intent leads; strict pricing and financing guardrails; SLA based escalation and calendar booking.
Technology: React, React Native, Laravel, MySQL, AWS, OpenAI with RAG, Twilio, CDK Elead, Automotive Mastermind.
Results: Under 30 second first response, 20 to 35% more booked appointments and 1 to 2 hours saved per rep per day.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Rescue / takeover; Extend existing product; Bug fixing / debugging; Ongoing maintenance / support; Discovery / scoping / consulting; Full time / contract to hire
* Product type: Web app; SaaS platform; Mobile app; Admin dashboard
* AI capability: AI powered; AI agent; RAG / knowledge base; AI automation
* Automation: Workflow automation; Email automation; SMS / WhatsApp messaging
* Workflow type: Lead generation / enrichment; Outreach / follow up; Appointment booking / scheduling; Billing / payments; Reporting / analytics; Data sync across systems; User onboarding / verification; Role based access / permissions; Inventory / orders
* Industry: Automotive
* CRM and business tools: CRM (any); Google Workspace; Twilio; Stripe
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: React / Next.js; PHP / Laravel

## LumiTrip
* Landing page: https://lumitrip.com/
* Case study link: https://stackupsolutions.com/projects/lumitrip
* Overview: A mobile first AI travel concierge PWA that builds a complete day by day itinerary in about 10 seconds from destination, dates, budget and travel style. It supports six languages, including right to left layouts, and lets users regenerate whole plans or single sections.
* Case study summary: Project: LumiTrip, a mobile first AI travel concierge PWA (Travel).
Problem: Planning a trip meant hours of research across many sites to build a day by day itinerary.
Solution: We built an app that creates a complete, editable itinerary in about 10 seconds from a few travel preferences.
Key features: Structured AI itineraries by morning, afternoon and evening; six languages with right to left support; regeneration that keeps locked edits; inline editing and favorites; shareable public links.
Technology: React, Node.js, Express, PostgreSQL, OpenAI GPT-4, JWT.
Results: 500 to 2,500 monthly users, 2,000 to 10,000 itineraries a month and 20 to 35% of itineraries leading to booking intent.
* Project stage: MVP; New build (from scratch)
* Product type: Web app; SaaS platform
* AI capability: AI powered; Content generation
* Industry: Hospitality
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: Node.js; React / Next.js; PostgreSQL

## ThreadLabStudio
* Landing page: https://threadlabs.dev/
* Case study link: https://stackupsolutions.com/projects/threadLab-studio
* Overview: A web based AI design SaaS that takes independent fashion designers from idea to factory ready apparel in minutes. Designers generate realistic garment mockups from prompts or artwork, with AI trend guidance and production ready exports.
* Case study summary: Project: ThreadLabStudio, an AI fashion design SaaS (Fashion, Ecommerce).
Problem: Independent designers spent hours on each mockup and struggled to turn ideas into factory ready files.
Solution: We built a web app that turns prompts and artwork into realistic apparel mockups and production ready tech packs.
Key features: AI garment mockups with realistic folds and prints; fast asynchronous generation; AI trend forecasting; tech pack PDF creator; manufacturer directory and Stripe payments.
Technology: React, Tailwind CSS, Supabase, OpenAI, Hugging Face, Replicate, Stripe.
Results: Design time cut from 2 to 6 hours to 2 to 10 minutes per mockup, with 1,000+ mockups created.
* Project stage: New build (from scratch)
* Product type: Web app; SaaS platform
* AI capability: AI powered; Computer vision; Content generation
* Workflow type: Billing / payments; Reporting / analytics; Search / matching; Project / task management
* Industry: E-commerce / retail
* CRM and business tools: Stripe
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: React / Next.js; Supabase / Firebase

## Kruzee
* Landing page: https://kruzee.com/
* Mobile link: https://play.google.com/store/apps/details?id=com.kruzee.kruzeeInstructor&hl=en
* Case study link: https://stackupsolutions.com/projects/kruzee
* Overview: A driving lesson platform that connects students with company managed instructors, built to scale from Canada into the US. Students book and pay for lesson packages on the web, and instructors manage schedules and lessons in a React Native mobile app.
* Case study summary: Project: Kruzee, a driving lesson platform scaling from Canada into the US (Education).
Problem: Lesson booking relied on manual coordination between students and instructors, limiting reliability and growth.
Solution: We built a vertically controlled platform with a student booking web app, an instructor mobile app and a central backend.
Key features: Location based lesson booking with packages; platform owned payments; React Native instructor app for schedules and availability; centralized scheduling and pricing logic; admin dashboard for instructors and payouts.
Technology: React, React Native (iOS and Android), centralized backend and payment orchestration.
Results: Much faster booking, better instructor utilization and operational control at scale without added headcount, supporting hundreds of active students.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Extend existing product; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app; Mobile app; Admin dashboard; API / backend service
* Automation: n8n
* Workflow type: Appointment booking / scheduling; Billing / payments; Search / matching
* Industry: Education; Automotive
* Compliance / sensitive data: GDPR; Security focused
* CRM and business tools: Stripe
* Tech stack: React / Next.js

## Eye Clinic Management
* Overview: An end to end clinic management platform for an eye clinic, made up of a React Native patient app and a web based clinician CRM on a shared backend. Patients book, pay, upload documents and manage appointments, while clinicians manage schedules, patients and services.
* Case study summary: Project: Clinic management platform for an eye clinic (Healthcare).
Problem: Booking, patient records, payments and invoicing ran on separate manual processes, with no self service for patients.
Solution: We built a patient mobile app and a clinician CRM on one shared backend covering booking through billing.
Key features: Real time booking, rescheduling and cancellation; medical document upload; tokenized payments; clinician calendars and patient directory; automatic PDF invoices and receipts.
Technology: React Native, web CRM, Node.js, JWT, tokenized payment gateway.
Results: One operational system from booking to billing with 24/7 patient self service.
* Project stage: MVP; New build (from scratch); Bug fixing / debugging; Ongoing maintenance / support; Discovery / scoping / consulting; Full time / contract to hire
* Product type: Web app; Mobile app; Admin dashboard; API / backend service
* Workflow type: Appointment booking / scheduling; Billing / payments; Reporting / analytics; User onboarding / verification; Role based access / permissions
* Industry: Healthcare
* Compliance / sensitive data: PCI / payment data; Security focused; Confidential / PII data
* Tech stack: Node.js; React / Next.js

## LexGuard Pro
* Landing page: https://lexguardpro.com/
* Overview: An AI powered compliance SaaS for landlords and property managers, built from prototype to beta. It rates each property Red, Yellow or Green against jurisdiction rules, stores compliance documents in an evidence vault and tracks deadlines.
* Case study summary: Project: LexGuard Pro, an AI compliance SaaS for landlords and property managers (Real Estate, Legal).
Problem: Landlords tracked licenses, inspections and deadlines across scattered files and risked fines or blocked filings when something expired.
Solution: We built a platform over six months, from prototype to beta, that scores each property's compliance and blocks risky actions when requirements are missing.
Key features: Red, Yellow and Green Compliance Ledger; jurisdiction rules managed as data; Evidence Vault with audit trails; Gatekeeper that blocks non compliant actions; daily expiry alerts and court ready evidence packs.
Technology: Next.js, NestJS, MySQL, AWS S3, OpenAI, Maryland SDAT and Baltimore Housing data pipelines.
Results: Clear compliance status per property, alerts before deadlines, auditable decisions and new jurisdictions added by configuration.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Bug fixing / debugging; Ongoing maintenance / support; Discovery / scoping / consulting; Full time / contract to hire
* Product type: Web app; SaaS platform; Admin dashboard
* AI capability: AI powered; AI automation; Document processing / OCR
* Automation: Workflow automation; Web scraping / data pipelines
* Workflow type: Claims / approvals / exceptions; Reporting / analytics; Data sync across systems; Role based access / permissions
* Industry: Legal; Real estate
* Compliance / sensitive data: Security focused; Confidential / PII data
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: React / Next.js

## Lucid Vision
* Overview: A cross platform mobile app that generates personalized meditation sessions in real time from each user's mood, goals and own words. It uses AI prompts per theme and memory across sessions so every session feels personal rather than scripted.
* Case study summary: Project: Lucid Vision, a personalized AI meditation app (Wellness).
Problem: Static meditation scripts felt generic and did not respond to each user's mood and goals.
Solution: We built a cross platform app that generates a personalized meditation session in real time from each user's input.
Key features: Category specific AI prompts; memory across sessions; immersive background audio; saved sessions for reflection; calm, ritual first UX.
Technology: React Native, Redux, Supabase, OpenAI gpt-4o-mini, ffmpeg, PostHog.
Results: A launch ready app delivering sessions that feel personal rather than scripted, with analytics to keep refining the experience.
* Project stage: MVP; New build (from scratch); Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Mobile app
* AI capability: AI powered; Content generation
* Workflow type: Reporting / analytics
* AI models and platforms: OpenAI / ChatGPT
* Tech stack: React / Next.js; Supabase / Firebase

## Malaab
* Landing page: https://www.malaab.ma/
* Overview: A multi tenant B2B2C sports facility booking platform that replaced phone, WhatsApp and spreadsheet bookings with one conflict free system. Players book slots, recurring sessions and tournaments with local payments in English and Arabic, while venues manage courts, pricing and availability.
* Case study summary: Project: Malaab, a multi tenant sports facility booking platform (Sports).
Problem: Courts and academies took bookings by phone, WhatsApp and spreadsheets, causing double bookings and heavy coordination.
Solution: We delivered a conflict free booking system for players, venues and admins in English and Arabic.
Key features: Single, recurring and tournament booking; real time slot locking; local payment gateway; venue portal for pricing and calendars; admin app across all tenants.
Technology: Laravel, React, React Native, local payment gateway, Arabic RTL support.
Results: About 70% less manual coordination, more reliable bookings and better utilization, with daily active usage across venues.
* Project stage: MVP; New build (from scratch); Prototype / proof of concept; Extend existing product; Bug fixing / debugging; Ongoing maintenance / support; Full time / contract to hire
* Product type: Web app; SaaS platform; Mobile app; Website / landing page; Admin dashboard
* AI capability: AI powered
* Workflow type: Appointment booking / scheduling; Billing / payments; Role based access / permissions
* Industry: Sports; Event management
* Tech stack: React / Next.js; PHP / Laravel
