# Accessibility via aria Attributes

Use ARIA attributes for interactive states instead of native HTML attributes where it improves accessibility.

## aria-disabled over disabled

```html
<!-- Correct -->
<button aria-disabled>Inactieve knop</button>

<!-- Avoid -->
<button disabled>Inactieve knop</button>
```

`aria-disabled` keeps the element focusable, so keyboard, speech, and switch users can still reach it and understand its context. Native `disabled` removes the element from the tab order entirely.

CSS uses opacity for the disabled style, which auto-adapts to dark/light/high-contrast modes:

```css
[aria-disabled] {
  opacity: var(--toepassing-opacity-interactive-disabled);
}
```

## Other aria conventions

- `aria-current="page"` on active nav links (not a `.active` class)
- `aria-invalid` on form fields with errors (not a `.error` class)
- `aria-expanded` on toggle buttons (e.g., mobile nav)

## Why

Styling via aria attributes ensures visual state and accessible state are always in sync; no risk of a class being applied without the matching accessibility semantics.
