# DC Ultimate Changelog

## [1.0.0-RC] - 2026-08-09 (Release Candidate)

### Complete Features Delivered across Phases 1 - 20
- **Phase 1 (Core Architecture)**: Manifest V3, Storage v1.0.0, Logger, EventBus, CacheManager, FeatureManager, MessageRouter.
- **Phase 2 (Parser + Reading + Navigation)**: Dedicated parsers, 300ms hover preview popover, multi-column reader, keyboard shortcuts, mobile URL redirect.
- **Phase 3 & 14 (Search Engine)**: Multi-page collection, rate limiter (250ms), composite key deduplication, virtual pagination (20/50/100/200), hash query caching, Search Profiles presets.
- **Phase 4 (Filters, User Notes, Comments, Media, Data)**: Centralized FilterEngine (`HIDE`, `DIM`, `BLUR`, `COLLAPSE`, `MARK`), UserNotesFeature CRUD, CommentToolsFeature JSON/CSV export, MediaToolsFeature image hash deduplication & batch downloader, DataManager backup/restore.
- **Phase 5 (Automation & Notifications)**: `chrome.alarms` background monitoring tasks, keyword alerts, NotificationManager cooldown throttler.
- **Phase 6 (MD3 UI & Dashboard)**: Material Design 3 component subsystem, system dashboard, 14 settings categories, gallery profiles override manager.
- **Phase 7 (Auth & AI)**: Session auth state detection (`Logged in`, `Logged out`, `Unknown`), official login navigation URL, local rule-based offline NLP provider, OpenAI / Gemini / Custom API adapters, PII masking & user confirmation privacy pipeline.
- **Phase 8 - 20 (Security, QA & Release Candidate)**: XSS `escapeHTML` / `sanitizeText` security sanitization, full regression test suite (19 test modules), zero remaining P0/P1/P2/P3 defects.
