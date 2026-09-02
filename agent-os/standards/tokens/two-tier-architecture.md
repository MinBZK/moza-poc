# Two-Tier Token Architecture

Tokens are split into two layers:

- **rijkshuisstijl**; Government design system palette (colors, typography, spacing). Cannot be changed; prescribed by Rijkshuisstijl.
- **toepassing**; Semantic application tokens that reference rijkshuisstijl values.

## Rule: CSS references toepassing only

```css
/* Correct */
color: var(--toepassing-color-text-default);

/* Wrong: never reference rijkshuisstijl directly in CSS */
color: var(--rijkshuisstijl-color-lintblauw-500);
```

## Why

- Separation of concerns: rijkshuisstijl is the government palette we inherit; toepassing maps it to our UI semantics
- Theming: swapping the base palette doesn't require touching component styles
- `_rijkshuisstijl.css` and `_toepassing.css` are auto-generated from `tokens/tokens.json` via Style Dictionary, never edit them manually
