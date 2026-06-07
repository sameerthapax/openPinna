# DB Infrastructure

`docker-compose.yml` now lives at the repository root so backend services can be added there later.

This `db/` directory keeps DB-specific assets:
- `init/001_extensions.sql` for first-boot Postgres extensions

## Start infra with dynamic ports

From repository root:

```bash
npm run docker:up
```

The script starts scanning at:
- Postgres: `9001`
- Redis: `9002`
- Mem0 API: `9003`
- Mem0 dashboard: `9004`

If a port is busy, it increments by `1` until it finds an open port.

Resolved ports are written to `.docker-ports.env`.

`npm run docker:up` also starts a separate self-hosted Mem0 stack for local agent memory. Mem0 uses its own internal Postgres container so it does not share schema ownership with the app Prisma database.

## Stop / reset

```bash
npm run docker:down
npm run docker:reset
```
