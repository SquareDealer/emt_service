# Design

Visual system for tatarin_crm — a calm, dense, precise tool. Anchored on a steel-blue
primary (a machinist's dial) with a single brass accent (the indicator lamp). Light by
default, dark by toggle. Restrained color strategy: neutrals + one action color + semantic
status colors; color carries meaning (status), never decoration.

## Color

OKLCH throughout. Tokens defined in `src/index.css`, themed via `[data-theme]`.

### Light (default)
| Role | OKLCH | Use |
|---|---|---|
| bg | `oklch(1 0 0)` | app background (pure white) |
| surface | `oklch(0.985 0.003 230)` | cards, panels |
| surface-2 | `oklch(0.968 0.005 235)` | sidebar, toolbars (cooler neutral layer) |
| border | `oklch(0.915 0.005 235)` | hairlines |
| ink | `oklch(0.23 0.02 240)` | body text (≥7:1 on bg) |
| muted | `oklch(0.50 0.018 240)` | secondary text (≥4.5:1) |
| primary | `oklch(0.55 0.13 233)` | actions, selection, focus, links — white text on fill |
| primary-ink | `oklch(0.43 0.13 233)` | primary text/links on light bg (contrast) |
| accent (brass) | `oklch(0.72 0.13 72)` | sparing highlights, "Ожидание" status |

### Dark
| Role | OKLCH |
|---|---|
| bg | `oklch(0.17 0.008 240)` |
| surface | `oklch(0.205 0.010 240)` |
| surface-2 | `oklch(0.235 0.012 240)` |
| border | `oklch(0.30 0.012 240)` |
| ink | `oklch(0.95 0.005 240)` |
| muted | `oklch(0.68 0.012 240)` |
| primary | `oklch(0.70 0.12 230)` |

### Status (kanban + semantics) — differ by hue, label, AND column position (colorblind-safe)
| Status | Hue | OKLCH (light) |
|---|---|---|
| scheduled / Запланирована | slate | `oklch(0.60 0.045 240)` |
| in_progress / В работе | blue (primary) | `oklch(0.55 0.13 233)` |
| waiting / Ожидание | brass | `oklch(0.72 0.13 72)` |
| done / Готова | green | `oklch(0.60 0.12 150)` |
| closed / Выдана | neutral-archived | `oklch(0.52 0.02 240)` |
| success | green `oklch(0.60 0.12 150)` |
| danger | red `oklch(0.57 0.19 25)` |

White text on any saturated fill (L 0.42–0.78). Dark text only on pale chips (L>0.85) — status
chips use a tinted-bg + colored-text style in light, filled in column headers.

## Typography

One family: **Inter** (variable) for all UI. Mono (`ui-monospace, "SF Mono", Menlo`) for VIN,
phone, money, IDs — anything tabular. Fixed rem scale (not fluid), ratio ~1.2.

| Token | Size / Line | Use |
|---|---|---|
| text-xs | 0.75rem / 1rem | meta, table sublabels |
| text-sm | 0.8125rem / 1.25rem | default UI, table cells |
| text-base | 0.9375rem / 1.4 | body, form values |
| text-lg | 1.0625rem / 1.5 | section titles |
| text-xl | 1.375rem / 1.3 | page titles |
| text-2xl | 1.75rem / 1.2 | login, big numbers |

`font-variant-numeric: tabular-nums` on all numeric/money/phone. Weights: 400 body, 500 labels,
600 titles/emphasis. No display fonts in UI.

## Spacing & shape

4px base scale (4/8/12/16/24/32/48). Radius: 6px controls, 8px cards, 10px panels, full for pills.
Density: 36px control height, 32px table rows. Borders 1px hairline. Shadows minimal —
`0 1px 2px` resting, slightly larger on overlays only. No decorative shadows.

## Components

Full state coverage on every interactive element: default / hover / focus-visible / active /
disabled / loading. Skeletons for loading (not center spinners). Empty states teach. One icon
set: **lucide-react**. Standard affordances only — native `<dialog>` for modals, real form labels.

## Motion

150–250ms, ease-out (`cubic-bezier(0.22,1,0.36,1)`). State/feedback only: status change,
row hover, panel open, toast. Kanban drag uses dnd-kit transforms. No page-load choreography.
`prefers-reduced-motion: reduce` → transitions collapse to instant/crossfade.

## Layout

App shell: left sidebar nav (collapsible) + top bar (global search + theme toggle + create).
Content is task-focused. Responsive is structural: sidebar collapses to icons/drawer under
~900px; tables get horizontal scroll or stacked rows on narrow; board scrolls columns
horizontally. No fluid typography.
