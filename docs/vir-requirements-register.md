# VIR Requirements Register

This register is derived from the attached **PMSLink VIR Module Specification v1.0** and the original HTML source is bundled in this standalone product at:

- `public/PMSLink_VIR_Module_Spec_v1.html`

## 1. Module Scope and Design Principles

- Questionnaire-based inspections with mandatory and risk-driven logic
- Observation and finding capture with photo evidence
- PSC concentrated inspection campaign auto-detection and highlight
- Carryover of unresolved findings between consecutive VIRs
- AI-powered import of third-party PDF reports
- Dual sign-off from vessel to shore to final close
- Gantt-based inspection calendar across the fleet
- JiBe-style grouped UX with color coding and photo timeline
- PSC CIC intelligence and auto-highlight behavior
- Shore gate preventing close without shore review
- Reference image thumbnails and full-size evidence separation
- True offline behavior with queued compressed photo sync

## 2. Inspection Type Master List

- The source spec claims 54 inspection types.
- The extracted HTML list contains 59 inspection types.
- All extracted inspection types are encoded in `src/lib/vir/catalog.ts`.

Categories covered:

- Vetting
- PSC / regulatory
- Class / survey
- Internal
- Audit / ISO

## 3. Technical Architecture Requirements

Source-spec architecture:

- Angular PWA frontend
- .NET 8 API backend
- SQL Server database
- IndexedDB / Dexie offline storage
- PDF.js document review
- OpenAI GPT-4o import engine
- Angular 17 with standalone components and signals
- `@angular/service-worker` background sync
- Capacitor Camera API
- ECharts / Apache
- SCSS + PrimeNG
- Entity Framework Core 8
- Hangfire queue
- Azure Blob / NAS file store
- JWT with PMSLink roles

Standalone adaptation in this repo:

- Next.js 16 frontend and backend routes
- Prisma ORM
- PostgreSQL / Railway target
- Structured foundation for later offline and AI layers

## 4. Core Data Model Requirements

- VIR inspection header
- Questionnaire template, sections, and questions
- Answers per question per inspection
- Findings and carryover links
- Corrective actions
- Photos and evidence
- Sign-off stage audit
- Import session and field-level review audit

## 5. Questionnaire Engine Requirements

- Template-driven per inspection type
- Eight answer modes: YES_NO_NA, SCORE, TEXT, DROPDOWN, DATE, NUMERIC, PHOTO, CHECKLIST
- Mandatory and high-risk validation
- CIC candidate flagging and reorder logic
- Reference image support

## 6. Findings and Carryover Requirements

- Finding types: non-conformity, observation, recommendation, positive
- Severity and status workflow
- Carry forward unresolved findings to the next VIR
- Corrective actions with owner, target, completion, and verification

## 7. Sign-Off Workflow Requirements

- Stage 1 vessel submission
- Stage 2 shore review
- Stage 3 final acknowledgement and close
- Backend close gate without shore approval

## 8. AI Import Requirements

- PDF upload
- Queue and extraction
- GPT-4o structured mapping
- Side-by-side review
- Confidence scoring
- Audit of AI vs user edits
- Long-document chunking
- OCR fallback for scanned PDFs
- Supported sources include Idwal, RightShip GHIA, SIRE 2.0 exports, ClassNK / BV / DNV reports, generic inspection PDFs, and scanned reports

## 9. Mobile and Tablet Requirements

- Desktop full feature
- iPad / tablet primary field device
- Phone secondary for observations and photos
- Offline caching and deferred sync
- Offline photo compression to about 300 KB
- Pending-sync banner and retry option
- Conflict handling where server timestamp wins
- Auto-sync within 5 seconds of connectivity restore

## 10. Dashboard and Export Requirements

- Upcoming inspections gantt
- Inspection calendar heatmap
- Open findings by vessel
- Overdue corrective action reporting
- Trend views
- Inspection score sparklines
- PSC detention / deficiency tracker
- SIRE / RightShip rating widgets
- Excel export on dashboard views
- Formal PDF report export with annexes
- Scheduled monthly fleet summary email

## 11. Sprint Delivery Plan

- Sprint 1 foundation and list workflow
- Sprint 2 questionnaire engine
- Sprint 3 observations and carryover
- Sprint 4 sign-off and notifications
- Sprint 5 AI import
- Sprint 6 PWA / mobile / offline
- Sprint 7 dashboard and reporting
- Sprint 8 UAT, performance, and documentation

## 12. Demo Build Requirements

- PDF import demo
- VIR form demo
- CIC highlight demo
- PDF export demo
- VB.NET / ASP.NET demo guidance in the original source
- 8-step walkthrough script in the original source
