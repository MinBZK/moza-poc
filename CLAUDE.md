# CLAUDE.md — AI Assistant Guide for MOx Design System

## Project Overview

MOx is a design token-based design system. It converts design tokens from Figma (via Tokens Studio) into CSS custom properties for use in web projects. The project is written and documented primarily in Dutch.

**Key concept:** Design tokens in `tokens/tokens.json` are the single source of truth. They are transformed into CSS variables via Style Dictionary and consumed by plain HTML/CSS pages.

## Repository Structure

``` text
MOx/
├── assets/
│   ├── favicon/              # Platform-specific favicons
│   ├── fonts/                # Rijksoverheid Sans variable fonts (.ttf)
│   └── images/               # SVG brand imagery (beeldmerk)
├── componenten/
│   └── componenten.html      # Component showcase (buttons, forms, breadcrumbs)
├── style/
│   ├── style.css             # Main stylesheet — manually edited
│   ├── _variables.css        # AUTO-GENERATED — do NOT edit manually
│   └── _reset.css            # Minimal CSS reset
├── style-dictionary/
│   ├── config.js             # Style Dictionary build configuration (ESM)
│   ├── package.json          # Build dependencies
│   └── package-lock.json     # Locked dependency versions
├── tokens/
│   └── tokens.json           # Master design tokens (Figma Tokens Studio format)
├── index.html                # Boilerplate landing page
└── README.md                 # Setup instructions (Dutch)
```

## Critical Rules

1. **NEVER edit `style/_variables.css` manually.** This file is auto-generated from `tokens/tokens.json` by running the build. Any manual changes will be overwritten.
2. **Token changes go in `tokens/tokens.json`.** To change a color, spacing value, or any design property, edit the token source, then rebuild.
3. **All documentation and UI labels are in Dutch.** Maintain this convention in component HTML, CSS comments, and commit messages.
4. **CSS class names are currently not namespaced.** A `mox-` prefix is under consideration for future NLDS (NL Design System) alignment. Do not add a namespace unless explicitly requested.

## Build System

### Prerequisites

- Node.js (no specific version required)
- npm

### Install Dependencies

```bash
cd style-dictionary && npm install
```

### Build Tokens to CSS

```bash
cd style-dictionary && npm run build
```

This runs `node config.js`, which:

1. Reads `tokens/tokens.json`
2. Applies the Tokens Studio preprocessor
3. Transforms names to kebab-case and converts px values to rem
4. Outputs CSS custom properties to `style/_variables.css`

### Build Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `style-dictionary` | ^3.8.0 | Core token-to-CSS transformation |
| `@tokens-studio/sd-transforms` | ^2.0.3 | Tokens Studio compatibility transforms |

## Architecture

### Token Flow

``` text
Figma (Tokens Studio) ←→ tokens/tokens.json → Style Dictionary → style/_variables.css → style/style.css → HTML pages
```

The system supports bidirectional sync: tokens can be edited in JSON (IDE) or in Figma via Tokens Studio, then committed via Git.

### Token Organization in `tokens.json`

- `brand.brand.color` — Color palette (lintblauw, paars, violet, robijnrood, etc.)
- `brand.brand.typography` — Text styles
- `brand.brand.space` — Spacing scale (4xs through 5xl)
- `brand.brand.size` — Sizing tokens
- `brand.brand.text` — Font families, sizes, weights
- `brand.brand.border-radius` — Border radii
- `brand.brand.border-width` — Border widths
- `brand.brand.box-shadow` — Shadow definitions
- `common` — Semantic tokens (colors, spacing for specific uses)
- `component/*` — Component-specific tokens (button, breadcrumb, form-field, link, text-input)

Token references use curly-brace syntax: `{color.action.bg-hover}`.

### CSS Variable Naming

Generated variables follow kebab-case with semantic hierarchy:

``` text
--category-subcategory-attribute-state
```

Examples:

- `--brand-color-lintblauw-50`
- `--button-primary-background-color`
- `--button-primary-hover-border-color`

### CSS Patterns

The project uses modern CSS features:

- **CSS nesting** for component states and variants
- **CSS custom properties** (variables) for all design values
- **`:focus-visible`** (not `:focus`) for keyboard-only focus indicators
- **`aria-disabled`** and **`aria-invalid`** attributes for state styling (not `:disabled`)

### Components Currently Implemented

- Buttons (primary, secondary, negative variants with hover/active/disabled states)
- Text inputs (with hover, focus, active, invalid states)
- Form field labels and descriptions
- Breadcrumb navigation
- Links
- Spacing utilities
- Typography (headings h1-h6)

## Testing

There is no automated test framework. Visual verification is done by opening:

- `index.html` — Landing page
- `componenten/componenten.html` — Component showcase

After making changes, open these files in a browser to verify rendering.

## Linting and Formatting

No linting or formatting tools (ESLint, Prettier, stylelint) are configured. There are no pre-commit hooks or CI/CD pipelines.

## Commit Message Conventions

The project uses emoji-prefixed commit messages (in Dutch):

| Emoji | Type | Use when... |
| ----- | ---- | ----------- |
| ➕ | Added | Adding new content to a file |
| ✏️ | Modified | Changing existing content |
| ❌ | Deleted | Removing content from a file |
| 🧼 | Hygiene | Small fixes, cleanup |
| 🐛 | Bugfix | Fixing a bug |
| 💾 | Backup | Backing up before major changes |
| 🔁 | Renamed | Renaming something |
| ↩️ | Revert | Reverting a previous commit |
| 🔀 | IDE ↔ Figma | Syncing tokens between IDE and Figma |

Example: `➕ Link component` or `🧼 padding-inline-start → padding-inline`

## Figma Integration

Tokens Studio plugin syncs with this repository:

- Source file: `tokens/tokens.json`
- Designers can pull tokens into Figma, modify them, and push back via Git
- Developers can edit the JSON directly in an IDE
- After any token change, run `npm run build` in `style-dictionary/` to regenerate CSS variables

## Common Tasks

### Add a new design token

1. Edit `tokens/tokens.json` — add the token in the appropriate category
2. Run `cd style-dictionary && npm run build`
3. Use the new CSS variable in `style/style.css` (e.g., `var(--new-token-name)`)

### Add a new component

1. Add component-specific tokens to `tokens/tokens.json` under `component/<name>`
2. Rebuild: `cd style-dictionary && npm run build`
3. Add CSS rules to `style/style.css` using the generated variables
4. Add HTML example to `componenten/componenten.html`

### Modify an existing design value

1. Find the token in `tokens/tokens.json`
2. Change the value
3. Rebuild: `cd style-dictionary && npm run build`
4. Verify in `_variables.css` that the variable updated correctly
