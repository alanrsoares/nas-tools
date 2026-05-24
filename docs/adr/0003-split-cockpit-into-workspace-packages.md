# Split Cockpit Into Workspace Packages

NAS Tools will move from a single CLI package toward a Bun workspace with shared core logic, a CLI app, a LAN server, and a Vite web app. This keeps Commander, Elysia/Drizzle, and React/shadcn dependencies separated while allowing CLI and Cockpit workflows to share the same typed services.

**Considered Options**

- Keep the flat repo and add `server/` and `web/`: less migration work, but weak boundaries as dependencies and build outputs grow.
- Split into workspace packages: more setup, but clearer ownership for core workflows, CLI entry points, server jobs, and web screens.
