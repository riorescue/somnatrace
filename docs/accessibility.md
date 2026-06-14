# SomnaTrace Accessibility Guide

**Standard:** WCAG 2.2 Level AA  
**Constraint:** No changes to the visual design, color palette, or layout

This document describes the accessibility patterns in use and the requirements all new UI code must meet. It is a reference for developers, not a task list.

---

## Baseline

The codebase targets WCAG 2.2 Level AA conformance. All patterns below are already in place throughout the app. New components must follow the same patterns — do not introduce exceptions without deliberate justification.

---

## Patterns in Use

### Focus styles

A global `:focus-visible` rule in `globals.css` provides keyboard focus outlines across all interactive elements:

```css
:focus-visible {
  outline: 2px solid #0284c7;
  outline-offset: 2px;
  border-radius: 4px;
}
```

Do not suppress focus outlines on interactive elements. Do not add `outline: none` or `tabIndex={-1}` unless the element is genuinely non-interactive or focus is being managed programmatically (e.g., inside a focus trap).

### Skip link

`App.tsx` renders a visually hidden skip link as the first focusable element. It targets `id="main-content"` on the `<main>` element. Every page inherits this — do not remove the `id` from `<main>`.

### Sidebar landmarks

`Sidebar.tsx` uses `<aside aria-label="Application navigation">` wrapping `<nav aria-label="Main">`. React Router's `NavLink` automatically adds `aria-current="page"` to the active link; no manual aria-current management is needed.

### Reduced motion

A `prefers-reduced-motion` rule in `globals.css` suppresses all animations and transitions for users who have opted out:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Do not add animation via inline `style` that bypasses this rule.

---

## Requirements for New Components

### Icons

Every Lucide icon must be explicitly classified as either decorative or meaningful.

**Decorative icon** (accompanies a visible text label or is purely visual):
```tsx
<Upload className="w-4 h-4" aria-hidden="true" />
Import
```

**Meaningful icon** (is the only content of an interactive element):
```tsx
<button aria-label="Close dialog">
  <X className="w-4 h-4" aria-hidden="true" />
</button>
```

Never rely on a `title` attribute as the accessible name for a button — it is not reliably announced. Use `aria-label` instead.

### Text contrast

Do not use `text-slate-400` (#94a3b8) for readable text content on white or light backgrounds — it fails the 4.5:1 minimum contrast ratio. Use `text-slate-500` (#64748b, ~4.6:1) or darker.

`text-slate-400` is acceptable only for:
- Interactive elements whose color transitions on hover/focus (e.g., `text-slate-400 hover:text-brand-500`)
- Secondary/muted text on the dark sidebar background (`bg-slate-900`) — `text-slate-400` (#94a3b8) on `#0f172a` is ~7.0:1 and passes. Do not use `text-slate-500` on dark backgrounds; it only reaches ~3.75:1 there.

When adding new secondary or supporting text, use `text-slate-500` as the floor.

### Color as the sole conveyor of information

Do not use color alone to communicate status, severity, or state. Always pair color with a text label or icon with an accessible name.

Examples already in use:
- AHI severity: accent color (`text-green-600`, `text-red-600`, etc.) is paired with a text label (`Normal`, `Severe`) in the `sub` prop of `StatCard`
- Import status: `ImportStatusBadge` always renders a text label alongside the color badge
- Event types in `EventsCard`: color dots are paired with text labels

### Status and error announcements

Dynamic content that appears in response to user actions must be announced by screen readers.

**Errors:** Use `role="alert"` (announces immediately on mount):
```tsx
{formError && <p role="alert" className="text-xs text-red-600">{formError}</p>}
```

**Loading states:** Use `role="status"` with a visually hidden label:
```tsx
<div role="status" className="… animate-spin">
  <span className="sr-only">Loading…</span>
</div>
```

`ErrorBanner.tsx` and `LoadingSpinner.tsx` already implement these patterns — use those components rather than inline alternatives.

### Modals and dialogs

Any modal overlay must:

1. Have `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing to the modal heading's `id`
2. Trap focus within the modal while open (Tab/Shift+Tab cycle within the modal, Escape closes)
3. Restore focus to the triggering element on close

`SessionReviewModal.tsx` is the reference implementation. The focus trap is implemented inline using `useRef` + `useEffect` — no external library is required.

### Tables

Every `<table>` must have:
- `aria-label` or `<caption>` identifying what the table contains
- `scope="col"` on every `<th>` element
- A non-empty header for every column, including action columns (`<span className="sr-only">Actions</span>` for visually empty headers)

### Forms

Every `<input>` or `<select>` must have:
- An explicit `htmlFor`/`id` pair linking label to control (wrapping labels are not sufficient for all assistive technologies)
- `aria-required="true"` on required fields
- Required indicators that are not solely visual: `<span aria-hidden="true">*</span><span className="sr-only">(required)</span>`
- `role="alert"` on validation error messages that appear dynamically

### Charts

Recharts SVG output is not accessible to screen readers. Every chart must be wrapped in a `<figure>` with a descriptive `<figcaption className="sr-only">`, and `aria-hidden="true"` must be set on the `<ResponsiveContainer>`:

```tsx
<figure>
  <figcaption className="sr-only">
    Line chart: AHI events per hour over the last 14 nights.
    Data also available in the Sessions table.
  </figcaption>
  <ResponsiveContainer aria-hidden="true" width="100%" height={180}>
    …
  </ResponsiveContainer>
</figure>
```

The figcaption should name the chart type, the metric displayed, the time range, and — where the data is available elsewhere on the page — point to that alternative. Where the chart is inside a flex or grid container, add `className="shrink-0"` to `<figure>` to preserve layout.

The `SignalChart` component in `SessionDetail.tsx` applies `aria-hidden="true"` directly to its `<ResponsiveContainer>` instances; the surrounding `ChartCard` heading provides the accessible context.

---

## What Is Out of Scope

- **Recharts keyboard navigation** — making individual data points keyboard-navigable within Recharts SVG is not feasible without replacing the chart library. The `aria-hidden` + `<figcaption>` pattern is the accepted workaround.
- **Mobile / touch layout** — the app targets desktop use.
- **Color palette changes** — all contrast requirements are met by selecting existing Tailwind slate steps (`slate-500`, `slate-600`, `slate-700`). The brand palette and overall visual design are unchanged.
