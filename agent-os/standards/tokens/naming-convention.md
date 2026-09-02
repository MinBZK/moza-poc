# Token Naming Convention

CSS variable names are auto-generated from the token structure in Figma/Tokens Studio.

## Pattern

```
--<set>-<category>-<subcategory>-<variant>
```

- **set**: `rijkshuisstijl` or `toepassing`
- **category**: `color`, `text`, `space`, `border`, `size`, `opacity`, etc.
- **subcategory**: semantic grouping (`interactive`, `feedback`, `background`, `heading`, etc.)
- **variant**: state or specificity (`default`, `hover`, `active`, `disabled`, `subtle`, `inverse`)

## Examples

```css
--toepassing-color-interactive-default-background
--toepassing-color-feedback-error-border
--toepassing-space-margin-md
--toepassing-text-heading-h1
--rijkshuisstijl-color-lintblauw-500
```

## Rules

- Names are Dutch where the Rijkshuisstijl prescribes it (color names, set names)
- Structure mirrors Figma token groups; keep Figma and code in sync
- New tokens should follow existing category/subcategory patterns
- Don't invent new top-level categories without updating Figma first
