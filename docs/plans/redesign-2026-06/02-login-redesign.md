# 02 — Login Redesign (split panel)

**ADR:** applies [0015 — Visual Identity](../../adr/0015-visual-identity-and-design-language.md)
**Status:** planned
**Depends on:** the `--brand` token + `Logo` component from [plan 01](./01-visual-foundation.md).

Family.co + Linear-inspired split: a branded nautical **left panel** with the login card hosted in a clean
centered **"window"** on the right. All auth logic is reused verbatim — only the page chrome changes.

---

## Reused as-is (do not touch the logic)
- `src/components/login/{LoginFormCard,WelcomeBackCard,MagicLinkSentCard,SignedInCard}.tsx` — re-housed, not
  rewritten.
- Magic-link + passkey conditional logic, autofill (`usePasskeys.ts`), browser-session welcome-back, the hidden
  `webauthn-anchor` input, the loader/`beforeLoad`, and `LocaleSwitcherInline`.

## New component
- `src/components/Logo.tsx` (shared with plan 01):
  - `<LogoMark className?>` — sailboat glyph as inline SVG (lift the paths from `public/favicon.svg`),
    `currentColor` strokes, `role="img"` + `aria-label="Oceanview"` (decorative copies `aria-hidden`).
  - `<Wordmark className?>` — `LogoMark` + "Oceanview" set in `font-heading`.

## `src/routes/login.tsx` (body only)

Replace `grid min-h-svh place-items-center p-4` with a responsive split:

```tsx
return (
  <div className="grid min-h-svh lg:grid-cols-2">
    {/* LEFT — brand panel; hidden < lg */}
    <aside className="brand-wash relative hidden flex-col justify-between overflow-hidden bg-brand p-10 text-brand-foreground lg:flex">
      <Wordmark className="relative" />
      <p className="relative max-w-sm text-lg text-brand-foreground/80">{m.login_tagline()}</p>
    </aside>

    {/* RIGHT — the "window": centered card host */}
    <main className="relative grid place-items-center p-4 sm:p-8">
      <div className="absolute top-4 right-4"><LocaleSwitcherInline /></div>
      <div className="mb-6 lg:hidden"><Wordmark /></div>
      {/* existing card switch — verbatim */}
      {sentTo ? <MagicLinkSentCard … /> : savedLogin ? <WelcomeBackCard … /> : <LoginFormCard … />}
      <input … webauthn-anchor … />
    </main>
  </div>
)
```

Notes:
- The brand panel uses the semantic `bg-brand` / `text-brand-foreground` tokens (from plan 01) — never the raw
  `#156cdd`. Until `--brand` exists, stand in with `bg-primary`.
- The "window" feel is the right `<main>`; reuse the shell's rounded surface tokens for consistency rather than
  re-deriving radius.
- Cards already cap at `max-w-sm` and drop in unchanged.
- `MagicLinkSentCard`/`SignedInCard` keep "Oceanview" as text for now; optionally swap their `CardTitle` to
  `<LogoMark>` later (nice-to-have, not required).

## i18n
- New key `login_tagline` in `messages/{sv,en}.json` (sv source). E.g. sv "Allt om båten, på ett ställe." /
  en "Everything about the boat, in one place." Run `pnpm i18n:compile` if editing outside `pnpm dev`.

## Responsive / a11y
- `lg:grid-cols-2`; left `<aside>` is `hidden lg:flex`; compact `<Wordmark>` shows `lg:hidden`.
- Decorative gradient/illustration layers `aria-hidden`; `LogoMark` carries an accessible name.
- Focus order: locale switcher → wordmark → form (DOM order already gives this).
- Contrast: white text on `bg-brand` passes AA; verify the `/80` tagline opacity over the wash.

## Critical files
- `src/routes/login.tsx`, `src/components/Logo.tsx` (new), `messages/{sv,en}.json`.
- Depends on `src/styles/app.css` `--brand` token (plan 01).

## Verify
- Split renders ≥ lg; single column + compact wordmark < lg.
- All four card states render and function; passkey button shows only when supported; locale switcher reachable.
- Brand panel contrast AA; `LogoMark` has an accessible name.
- sv + en, light + dark, mobile + desktop.
