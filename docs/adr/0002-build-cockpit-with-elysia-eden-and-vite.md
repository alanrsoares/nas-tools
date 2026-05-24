# Build Cockpit With Elysia Eden And Vite

NAS Tools Cockpit will use Elysia for the LAN server, Eden/Treaty for typed client calls, and Vite for the React dashboard. This keeps the Cockpit close to the existing gpt-proxy server style while avoiding TanStack Start SSR and server-function machinery that the internal Cockpit does not need.

**Considered Options**

- TanStack Start: useful for SSR, streaming, route loaders, and server functions, but heavier than needed for a LAN-only operational Cockpit.
- Elysia with Eden/Treaty and Vite: typed API boundary, simple static asset serving in production, and a small Bun-native server shape.
