export const virDesignPrinciples = [
  "Full lifecycle management of all vessel inspections from scheduling through close-out.",
  "Questionnaire-based inspection with conditional logic, risk levels, and mandatory flagging.",
  "Observation and finding capture with photo evidence and offline-capable workflow.",
  "PSC concentrated inspection campaign auto-detection and highlight.",
  "Defect carryover between consecutive VIRs until formally closed.",
  "AI-powered import of third-party PDF reports such as Idwal, Anglo-Eastern, and RightShip.",
  "Dual sign-off workflow from vessel submission through shore review and final close.",
  "Gantt-based inspection calendar across fleet.",
  "JiBe-parity style UX with section grouping, color-coded findings, and a photo timeline.",
  "Reference image thumbnails for standards alongside full-size vessel evidence uploads.",
  "Shore gate enforcement so vessel cannot close a VIR without shore review logged.",
  "True offline workflow with compressed photos queued and synced on reconnect.",
];

export const virArchitectureRequirements = [
  { area: "Frontend", stack: "Angular PWA in the source spec", note: "Tablet-first questionnaire and review experience with mobile support." },
  { area: "Backend", stack: ".NET 8 API in the source spec", note: "Our standalone implementation adapts this into Next.js route handlers and Prisma." },
  { area: "Database", stack: "SQL Server in the source spec", note: "Adapted to PostgreSQL for Railway deployment." },
  { area: "Offline", stack: "IndexedDB / Dexie.js", note: "Draft VIRs, questionnaire answers, observations, and photo queue." },
  { area: "PDF View", stack: "PDF.js", note: "Required for side-by-side import review." },
  { area: "AI", stack: "OpenAI GPT-4o", note: "Used for PDF import and field mapping." },
];

export const virFrontendTechnologyTable = [
  "Framework: Angular 17 with standalone components and signals in the source spec.",
  "PWA: @angular/service-worker with background sync and offline cache.",
  "Offline DB: IndexedDB (Dexie.js) for draft VIRs and photo queue.",
  "Photo capture: Capacitor Camera API with EXIF strip and WebP compression.",
  "Charts: ECharts / Apache for Gantt, trend lines, and heatmaps.",
  "PDF view: PDF.js for in-app import preview.",
  "Styling: SCSS + PrimeNG aligned to PMSLink design system.",
];

export const virBackendTechnologyTable = [
  "API: .NET 8 Web API with RESTful and minimal API approach in the source spec.",
  "ORM: Entity Framework Core 8 with code-first migrations.",
  "DB: SQL Server 2019 on shared PMSLink instance in the source spec.",
  "File store: Azure Blob or NAS for photos and PDF reports.",
  "AI: OpenAI GPT-4o API for PDF import and classification.",
  "Queue: Hangfire for asynchronous AI processing jobs.",
  "Auth: JWT with existing PMSLink vessel, shore, and TSI roles.",
];

export const virCoreDataModelRequirements = [
  "VIR_Inspection header with status, counts, previous VIR link, shore review metadata, and import source linkage.",
  "VIR_Observation / finding records with type, severity, due dates, carryover lineage, and shore comments.",
  "VIR_Photo evidence linked to questions and findings.",
  "VIR_CorrectiveAction workflow with owner, target date, completion remark, and verification.",
  "VIR_Question questionnaire template with ordering, answer types, risk levels, CIC flag, and reference images.",
  "VIR_SignOff records covering each approval stage and comments.",
];

export const virQuestionnaireRequirements = [
  "Template-driven questionnaire per inspection type with section grouping and sequence ordering.",
  "Support the exact eight answer types from the source spec: YES_NO_NA, SCORE, TEXT, DROPDOWN, DATE, NUMERIC, PHOTO, and CHECKLIST.",
  "Risk levels from low to critical with mandatory blocking logic on submit.",
  "CIC auto-highlight logic for PSC inspections that moves concentrated items to the top of the section.",
  "Reference images on question cards, distinct from vessel evidence uploads.",
];

export const virPhotoRequirements = [
  "Capture via native camera on mobile or file input on tablet and desktop.",
  "Compression to WebP with max 1200 px width and 75 percent quality before IndexedDB store.",
  "Reference images limited to 300 px thumbnails stored as standards.",
  "Evidence uploads stored full-size in blob storage with thumbnails generated server-side.",
  "Offline queue supports up to 200 photos and syncs in batches of 10.",
  "GPS and device EXIF metadata stripped before upload for privacy.",
];

export const virFindingWorkflowRequirements = [
  "Finding types include non-conformity, observation, recommendation, and positive finding.",
  "Severity is color-driven and visible in grouped observation screens.",
  "Open findings from the previous VIR must be surfaced before close and can be auto-carried to the next VIR.",
  "Corrective actions require status workflow, completion date, and remarks before closeout.",
];

export const virSignOffRequirements = [
  "Stage 1: Vessel submit after mandatory checks and shipboard sign-off.",
  "Stage 2: Shore review by QHSE / Fleet Manager with approve or return path.",
  "Stage 3: Final close after vessel acknowledgement and corrective-action completion check.",
  "Backend validation must prevent closure without shore sign-off.",
];

export const virImportRequirements = [
  "Upload PDF from web or mobile with file size up to 50 MB.",
  "Queue the import job and extract text before model classification.",
  "Use GPT-4o with a structured prompt returning header fields, findings, and corrective actions as JSON.",
  "Present side-by-side review with original PDF on the left and parsed data on the right.",
  "Show confidence per field and retain audit of AI-suggested vs user-modified values.",
  "Support chunking strategy for long reports and OCR fallback for scanned PDFs.",
  "Supported source types named in the spec include Anglo-Eastern / Idwal reports, RightShip GHIA inspection PDFs, SIRE 2.0 exports, ClassNK / BV / DNV reports, generic inspection PDFs, and scanned PDFs via Azure Form Recognizer pre-process.",
];

export const virMobileRequirements = [
  "Desktop and laptop are full-feature priority P0.",
  "iPad and 10 inch tablets are priority P1 for full questionnaire, camera, and offline use.",
  "Phones are priority P2 for observation entry, photos, and limited questionnaire view.",
  "Offline support must cache template, vessel particulars, questionnaire structure, and queue photo uploads for sync.",
  "Offline photos are compressed to about 300 KB per image and up to 200 can be queued.",
  "Sync indicator banner shows pending item count with retry option.",
  "Conflict handling uses server timestamp wins with user notification.",
  "Auto-sync fires within 5 seconds of connectivity restore via Background Sync API.",
];

export const virDashboardRequirements = [
  "Upcoming inspections gantt by vessel and date.",
  "Inspection calendar as monthly heatmap.",
  "Open findings by vessel as stacked bar.",
  "Overdue corrective actions table with RAG highlight.",
  "Finding trend line over rolling six months.",
  "Inspection score sparkline per vessel.",
  "PSC detention and deficiency tracker.",
  "SIRE / RightShip rating gauge and history.",
  "Excel export on every dashboard panel.",
  "Vessel multi-select with select all, deselect all, saved named views, and fleet filters.",
  "Scheduled monthly email of fleet inspection summary PDF.",
];

export const virPdfRequirements = [
  "Cover page with vessel, inspection, and summary details.",
  "Executive summary and scope of inspection narrative on page 2.",
  "Preamble sections across general, safety, engineering, navigation, PMS, environment, cyber, MLC, and certificates.",
  "Condition assessment section with Good, Fair, and Poor color blocks.",
  "Observation section listing each finding, corrective actions, and photos.",
  "Annex pages for photo gallery and digital signature details.",
];

export const virSprintSummary = [
  "Sprint 1: Database migration, header CRUD, list screen, new VIR form, and role mapping.",
  "Sprint 2: Questionnaire engine, CIC detection, renderer, reference images, and validation blocks.",
  "Sprint 3: Observation CRUD, carryover service, observation UI, corrective action UI, and photo upload service.",
  "Sprint 4: Sign-off state machine, shore feedback model, notifications, and sign-off screens.",
  "Sprint 5: AI PDF import engine, OCR fallback, review workflow, and import audit trail.",
  "Sprint 6: PWA, Dexie offline layer, background sync, camera integration, and responsive layouts.",
  "Sprint 7: Dashboard aggregation endpoints, charts, drilldowns, Excel export, and full PDF report generation.",
  "Sprint 8: UAT, performance tuning, and documentation for deployment.",
];

export const virDemoRequirements = [
  "Demo 1: PDF import showing parsed VIR header and findings beside the PDF.",
  "Demo 2: Simple VIR form with vessel, inspection type, observations, and corrective action entry.",
  "Demo 3: CIC highlight behavior for Port State Control questionnaire items.",
  "Demo 4: PDF export generated from demo data using iTextSharp in VB.NET.",
  "Source spec also includes VB.NET / ASP.NET demo guidance, VB.NET OpenAI call snippet, and an 8-step presentation walkthrough script.",
];
