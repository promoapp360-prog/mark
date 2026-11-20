# Mark sugar

MARK e-commerce imported from https://github.com/promoapp360-prog/mark.git. Preserve the existing Node.js, static HTML and SQLite implementation; this import is not a redesign or database migration.

## Imported application

- Run: `pnpm --filter @workspace/mark-sugar run dev`.
- Original application: `artifacts/mark-sugar/mark/`; its own README documents business features and configuration.
- Requires Node 22.5+ with `node:sqlite`. SQLite and generated files remain local development data, excluded from Git and deployment.
- Admin login is disabled until `ADMIN_PASSWORD` is configured through Secrets. Never restore the original public default password.
- Payments, shipping, legal content and durable production storage need configuration and review before accepting real orders. Do not publish this SQLite import as a production store without addressing durable storage.
- Keep the existing customer's accounts and providers isolated; do not migrate storage or authentication as part of a simple import.
- Product previews use the unbranded base images embedded in the customer's REAL FOOTBALL PDF; accessory shapes follow pages 4–5 of the MARK 2026 catalog. Do not turn other customers' logos from the supplied proofs into default storefront templates. Preview-only changes must not alter print measurements or production exports.
- Corporate copy and contacts are grounded in `https://www.marksugar.it/azienda.asp`, `/contatti.asp`, and the Instagram/Facebook references on the official homepage. The operating office is distinct from the registered office. The customer explicitly confirmed the registered address and VAT number shown on the website; that confirmation takes precedence over conflicting third-party directory listings. Do not replace them based only on directory results.
- The contacts form opens the user's email client and does not transmit or store enquiries on the server. The embedded Google map loads only on request. Do not imply server-side email delivery or add tracking/social embeds silently.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
