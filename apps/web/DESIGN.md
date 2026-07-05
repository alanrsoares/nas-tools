---
name: NAS Tools Console
description: Focused media staging tool for personal NAS management
colors:
  midnight-teal: "oklch(0.135 0.018 175)"
  surface-teal: "oklch(0.185 0.015 175)"
  cavern-teal: "oklch(0.105 0.015 175)"
  signal-teal: "oklch(0.575 0.140 170)"
  polar-white: "oklch(0.935 0.006 155)"
  slate-teal: "oklch(0.595 0.012 165)"
  dim-border: "oklch(0.265 0.018 175)"
  leaf-green: "oklch(0.555 0.130 155)"
  amber-caution: "oklch(0.640 0.130 60)"
  fault-red: "oklch(0.580 0.165 25)"
typography:
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "0.01em"
  heading:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "22px"
components:
  button-primary:
    backgroundColor: "{colors.signal-teal}"
    textColor: "{colors.cavern-teal}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "oklch(0.630 0.140 170)"
  badge-success:
    backgroundColor: "oklch(0.200 0.060 155)"
    textColor: "{colors.leaf-green}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  badge-warning:
    backgroundColor: "oklch(0.195 0.045 60)"
    textColor: "{colors.amber-caution}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  badge-secondary:
    backgroundColor: "oklch(0.230 0.018 175)"
    textColor: "{colors.slate-teal}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  input-default:
    backgroundColor: "oklch(0.210 0.016 175)"
    textColor: "{colors.polar-white}"
    rounded: "{rounded.md}"
    padding: "7px 10px"
---

# Design System: NAS Tools Console

## 1. Overview

**Creative North Star: "The Instrument Panel"**

A tool so well-calibrated that the interface disappears. Every element earns its pixel the way an aircraft instrument earns its dial: legible under pressure, unambiguous under any lighting condition, with nothing present that doesn't directly serve the pilot. The analogy extends to density: instrument panels are dense not because they're showing off, but because the person in the seat needs all that information and trusts themselves to read it.

The palette is deep teal-black, descended from the existing brand without apologizing for the darkness. This is a personal NAS tool used in the evening while a download batch finishes; the ambient light is low, the user is focused, and a white dashboard would be the wrong choice for both the physical context and the psychological register. The darkness isn't a style statement, it's correct.

Inter is the body font throughout. The product register reference is explicit: Inter is a legitimate default here. The quality comes from tuning — tracking on labels, tabular numerals in data cells, a tight type scale that feels purposeful rather than system-default.

This system explicitly rejects: generic SaaS purple gradients and hero aesthetics; Bootstrap admin panels with their blue sidebars and heavy table borders; the "hacker terminal" aesthetic (green-on-black, monospace everywhere, designed to look cool rather than work well).

**Key Characteristics:**

- Deep teal-black base with single vivid teal accent
- Single typeface (Inter), tuned by weight and letter-spacing rather than by family swapping
- Flat tonal layering for depth — no shadows
- Motion only on state change (150ms ease-out-quart), never decorative
- Information density is a feature, not a problem to solve

## 2. Colors: The Teal Depth Palette

A restrained dark palette: one accent, multiple neutral teal layers building depth through lightness increments only.

### Primary

- **Signal Teal** (`oklch(0.575 0.140 170)`): The single active accent. Used exclusively on primary buttons, active nav items, focus rings, and interactive highlights. Its rarity makes it mean something.

### Neutral

- **Midnight Teal** (`oklch(0.135 0.018 175)`): App background. The floor everything else sits on.
- **Surface Teal** (`oklch(0.185 0.015 175)`): Card and panel surfaces. One step lighter than the floor.
- **Cavern Teal** (`oklch(0.105 0.015 175)`): Sidebar. Slightly darker than the floor — below the floor, visually recessed.
- **Accent Surface** (`oklch(0.245 0.020 175)`): Hover states, selected rows. Third tonal step.
- **Dim Border** (`oklch(0.265 0.018 175)`): Borders and dividers. Barely perceptible against surfaces.
- **Polar White** (`oklch(0.935 0.006 155)`): Primary text. Slightly warm, never pure white.
- **Slate Teal** (`oklch(0.595 0.012 165)`): Secondary text, labels, metadata. Exactly half the visual weight of Polar White.

### Secondary (semantic)

- **Leaf Green** (`oklch(0.555 0.130 155)`): Success states and "Included" badges. Distinct from Signal Teal by hue and intent.
- **Amber Caution** (`oklch(0.640 0.130 60)`): Warning states, "Needs Fix" badges, field errors.
- **Fault Red** (`oklch(0.580 0.165 25)`): Destructive actions only — not used in the current surface.

### Named Rules

**The One Accent Rule.** Signal Teal appears on ≤10% of any given screen. One primary button, one active nav item. Its scarcity is the point. Do not use it as a decorative color.

**The No-Zero Rule.** Never use `oklch(0 0 0)` black or `oklch(1 0 0)` white. All neutrals carry a minimum chroma of 0.005 toward the teal hue family.

## 3. Typography

**Body Font:** Inter (ui-sans-serif, system-ui, -apple-system, sans-serif)

**Character:** Single-family discipline. Weight and tracking do all the work Inter is capable of doing on a dark surface. No display font, no secondary family.

### Hierarchy

- **Heading** (600, 20px, -0.01em tracking, 1.2 line-height): Section titles in the topbar. One per view.
- **Body** (400, 14px, normal, 1.5 line-height): Table cells, descriptions, setting values.
- **Label** (500, 12px, 0.01em tracking): Badges, chips, column headers, setting field names.
- **Data** (400, 14px, tabular-nums): Any numeric or path value in a table cell. `font-variant-numeric: tabular-nums` always active in data columns.

### Named Rules

**The Tabular Rule.** Numbers in data cells always use `font-variant-numeric: tabular-nums`. Columns that mix single-digit and multi-digit values misalign without it.

**The One-Family Rule.** No second typeface. If variety is needed, use weight, size, and letter-spacing — not a different family.

## 4. Elevation

Flat-by-default tonal system. No box-shadows anywhere. Depth is expressed through lightness increments: Cavern Teal (sidebar) sits below Midnight Teal (page) which sits below Surface Teal (cards). The border (`Dim Border`) marks the card edge; the lightness difference does the actual work.

The only exception is a `0 0 0 1px var(--border)` inset ring on focus states, which uses the border color rather than a colored glow.

### Named Rules

**The No-Shadow Rule.** No `box-shadow` on any resting surface. Focus rings use `ring-offset-background` only. Hover states shift background color, not elevation.

## 5. Components

### Buttons

Confident and deliberately sized. Never oversized.

- **Shape:** Gently curved (6px radius)
- **Primary:** Signal Teal background, Cavern Teal text, `8px 14px` padding. Height ~34px. Never uppercase.
- **Hover:** Lightness up to `oklch(0.630 0.140 170)`, 150ms ease-out-quart.
- **Focus:** 2px ring at Signal Teal with 2px offset.
- **Disabled:** 50% opacity, `cursor-wait` during loading.

### Badges / Chips

Tight pill shape. Color-coded for state legibility at a glance.

- **Success (Included):** Very dark green background (`oklch(0.200 0.060 155)`), Leaf Green text. Icon + text.
- **Warning (Needs Fix):** Very dark amber background (`oklch(0.195 0.045 60)`), Amber Caution text. Icon + text.
- **Secondary (Excluded / Media type):** Muted teal background, Slate Teal text. Text only.

### Cards

The workspace container for each section.

- **Corner Style:** Gently curved (8px radius)
- **Background:** Surface Teal (`oklch(0.185 0.015 175)`)
- **Shadow Strategy:** None. Tonal differentiation from Midnight Teal background + Dim Border.
- **Border:** 1px Dim Border on all sides.
- **Internal Padding:** 16px (`spacing.md`)

### Inputs / Fields

- **Style:** Muted Surface background (`oklch(0.210 0.016 175)`), 6px radius, 1px Dim Border.
- **Focus:** 2px Signal Teal ring, 150ms ease-out.
- **Warning:** Amber Caution border, very dark amber background tint.
- **Read-only:** Reduced opacity (65%) — clearly not interactive.

### Navigation (Sidebar)

- **Background:** Cavern Teal, recessed below the main content surface.
- **Items:** 10px 11px padding, 6px radius on hover/active.
- **Default:** Transparent background, Polar White text at 65% opacity.
- **Hover:** Accent Surface background, full opacity text.
- **Active:** Accent Surface background, Signal Teal left icon tint (via CSS color on icon).
- **Brand Name:** 15px, 600 weight, -0.02em tracking. Flanked by a 5px Signal Teal square indicator.

### Plan Table

Signature component — the primary workspace.

- **Header:** Muted Surface background, Slate Teal text, 500 weight labels.
- **Rows:** Transparent at rest, Accent Surface on hover (`hover:bg-muted/50`), 100ms ease-out transition.
- **Bottom border only** on rows. No vertical column borders.
- **Path cells:** `overflow-wrap: anywhere` with `max-width: 360px`. No truncation that hides important data.

## 6. Do's and Don'ts

### Do:

- **Do** use Signal Teal exclusively for primary actions, active states, and focus rings — nothing else.
- **Do** use `font-variant-numeric: tabular-nums` on any column containing numbers, file counts, or sizes.
- **Do** express depth through lightness increments in the teal family — sidebar darkest, cards one step lighter, hover one step lighter still.
- **Do** keep all transitions at 150ms with `cubic-bezier(0.25, 0, 0, 1)` (ease-out-quart). Never exceed 200ms in product UI.
- **Do** use Amber Caution (not Fault Red) for data quality warnings. Red implies system failure; amber implies fixable data.

### Don't:

- **Don't** use purple gradients, hero CTAs, onboarding checklists, or any generic SaaS pattern. Per PRODUCT.md: "the interface is the tool, not a brochure for the tool."
- **Don't** use Bootstrap-style heavy blue sidebars, oversized nav elements, or table borders on every cell edge.
- **Don't** use green-on-black or monospace-everywhere — the design should feel like a sharp instrument, not a terminal cosplay.
- **Don't** add `box-shadow` to resting surfaces. Tonal layering is the depth strategy.
- **Don't** use `border-left` or `border-right` thicker than 1px as a colored accent stripe. Rewrite with a background tint instead.
- **Don't** use gradient text (`background-clip: text`). All text is a single solid color.
- **Don't** add animation to page load or section changes. Users are in a workflow; they don't want choreography.
- **Don't** use tabular numeric display fonts or monospace for non-code content. Inter tabular-nums is sufficient.
