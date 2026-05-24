# Persist Cockpit Jobs With SQLite And Drizzle

NAS Tools Cockpit will run LAN-accessible workflows that can outlive a browser session or page refresh. Persist job state, job events, and dry-run plans in SQLite using Drizzle and drizzle-kit so the server keeps a typed local persistence model without adding an external database service.

**Considered Options**

- In-memory state: simpler, but loses job progress and results on restart.
- JSON files: small dependency surface, but weaker query and migration story once job history grows.
- SQLite with Drizzle: local and durable, with typed schema and migrations.
