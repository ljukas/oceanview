# Oceanview

Internal web app for the Oceanview sailboat co-ownership group.

## Stack

- **Framework:** [TanStack Start](https://tanstack.com/start/latest) (RC) — file-based router in `src/routes/`
- **UI:** [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) (planned)
- **Auth:** [Better Auth](https://www.better-auth.com) — magic-link only (planned)
- **Database:** [Neon Postgres](https://neon.tech) via Vercel Marketplace + [Drizzle ORM](https://orm.drizzle.team) (planned)
- **File storage:** [Cloudflare R2](https://developers.cloudflare.com/r2/) (planned)
- **Email:** [Resend](https://resend.com) (planned)
- **Hosting:** [Vercel](https://vercel.com) (Hobby)
- **Package manager:** pnpm

## Develop

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # production build (Nitro → .output/)
```

## Documentation

See [CLAUDE.md](./CLAUDE.md) for the full stack rationale, architectural decisions, and conventions.
