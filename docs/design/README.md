# BRIVIO design system

Source of truth for how BRIVIO looks. Extracted from the reference images in this folder.

## References

| File | What it shows | Used for |
| --- | --- | --- |
| `01-landing-hero.webp` | "Synro" creator-platform landing page: kraft-paper background, heavy wide uppercase headline, orange split CTA, photo card with black label and rotating blue stamp, "upload your content" ticket card with progress rows, black card with coloured chips | Whole visual language; Home page layout |

This is the **only** reference so far. It is a third-party design used as a style guide: we take the look, not its
copy, logo or photos. Add further references here as `02-…`, `03-…` and extend the table.

## Tokens

Tailwind v4 has no `tailwind.config` by default; the theme lives in the `@theme` block of `src/index.css`.
Every token is both a CSS variable and a Tailwind utility.

| Token | Value | Utility | Use |
| --- | --- | --- | --- |
| `--color-paper` | `#ead2b8` | `bg-paper` | Page background (plus CSS grain and creases on `body`) |
| `--color-paper-deep` | `#dfc2a2` | `bg-paper-deep` | Image placeholders, pressed states |
| `--color-bark` | `#33190c` | `bg-bark` | Footer, outer frame |
| `--color-ink` | `#121110` | `bg-ink` / `text-ink` | Text, dark cards, dark buttons |
| `--color-ink-soft` | `#5a4636` | `text-ink-soft` | Secondary text |
| `--color-cream` | `#fffaf4` | `bg-cream` | Light cards, inputs, text on ink |
| `--color-brand` | `#ff5b0a` | `bg-brand` / `text-brand` | Primary actions, highlights, prices |
| `--color-blue` | `#2f5bff` | `bg-blue` | Verified / trust signals only |
| `--color-lime` | `#dfe8a6` | `bg-lime` | Progress fills |
| `--color-line` | ink at 16% | `border-line` | Hairline dividers |
| `--font-display` | Archivo, width 125, weight 900 | `display` | Headings, button labels (always uppercase) |
| `--font-sans` | Onest | default | Body text |
| `--radius-btn` | `0.75rem` | `rounded-btn` | Buttons, inputs, tabs |
| `--radius-card` | `1.25rem` | `rounded-card` | Cards |
| `--shadow-card` | soft brown drop | `shadow-card` | Cards on paper |

Custom utilities: `display` (headline face), `ticket` (side notches; position with `--notch-y`), `dots` (orange dotted square).

## Rules of thumb

- Headings are `display`: uppercase, tight, big. Body copy is Onest, sentence case.
- Orange is for the one primary action on a screen. Black is for secondary actions and dense info cards.
- Blue means "verified / licensed" and nothing else.
- Sections are separated by `border-line` hairlines, not boxes. Cards sit on the paper with `shadow-card`.
- Small labels: `text-xs font-bold uppercase tracking-wider`.
- Every grid starts with `grid-cols-1` so content cannot stretch past a phone screen.
- Check each page at 375px and 1280px.

## Components (`src/components/ui`)

Import from `../components/ui`.

| Component | Notes |
| --- | --- |
| `Button` | `variant`: primary (orange), dark, light, outline. `size`: sm, md, lg. `to` makes it a link. `icon` adds the split square. `full` for full width. |
| `Chip`, `ChipList` | `tone`: paper, white, ink, orange, blue. Pass `onClick` + `selected` to make a toggle chip for filters and multi-select fields. |
| `Badge`, `VerifiedBadge` | Small uppercase pills: blue, orange, ink, muted. |
| `Card` | `tone`: cream, ink, outline. `ticket` + `notchY` for notches. `to` makes the card a link with hover lift. |
| `Input`, `Select` | Labelled controls with `label`, `hint`. `Select` takes `options` (strings or `{value,label}`) and `placeholder`. |
| `Tabs` | Controlled: `tabs`, `active`, `onChange`; optional `count` per tab. |
| `PageHeader` | `eyebrow`, `title`, `subtitle`, `actions`. Use at the top of every inner page. |
| `EmptyState` | `title`, `body`, optional `action` link. |
| `Media` | `<img>` that falls back to a branded block if the image is missing or its host fails. Use for all portfolio media. |
| `Spinner`, `Avatar`, `PageContainer` | Loading state, avatar with initial fallback, page width and padding. |

## Pages

| Page | Status | Reference |
| --- | --- | --- |
| Home | Restyled | `01-landing-hero.webp` (hero, pillars row, black chip card, ticket card) |
| Creators list, Creator profile, Portfolio viewer, Login, Brief view, Brief list | Restyled | No dedicated reference; built from the tokens and components above |

### Pages not built yet

There is **no dedicated reference image** for any of these. Until one is added, follow the patterns below, all taken
from `01-landing-hero.webp`.

| Page | Follow this |
| --- | --- |
| Creator onboarding (`/onboarding/creator`) | `PageHeader` + stepped form in cream `Card`s. `Tabs` as the step indicator. Tools, skills and specializations as toggle `Chip`s from `taxonomy.ts`. Orange `Button` only on the final step; `dark` for Next. |
| Portfolio item form | Model it on the reference's "Upload your content" card: cream `Card ticket`, centred `display` title, drag-and-drop area, then workflow steps as numbered rows (black number square + tool + action), like the "How a piece is made" card on Home. Lime bar for upload progress. |
| Search filters (`/creators`) | Filter bar under the `PageHeader`: `Input` for search, `Select` for city and price, toggle `Chip`s for tools, specializations and skills. On mobile, collapse into a `dark` "Filters" button that opens an ink panel like the mobile menu. Show the result count as an ink `Badge`. |
| Brief form (`/briefs/new`) | Two columns on desktop: form sections in cream `Card`s on the left, and a sticky ink `Card` on the right summarising the brief and commercial-use rights (same style as the rights card on the brief view). Usage platforms and aspect ratios as toggle `Chip`s. |
