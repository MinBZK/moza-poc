# Astro Migration Guide

## What Changed

This project has been migrated from Eleventy to Astro to better support React components.

### Key Changes:

1. **Build System**: Eleventy → Astro
2. **Template Format**: Nunjucks (.njk) → Astro (.astro)
3. **Directory Structure**:
   - Pages moved to `src/pages/`
   - Layouts moved to `src/layouts/`
   - Components moved to `src/components/`
   - Static assets stay in `assets/` (configured as publicDir)

### Migration Steps Completed:

✅ Created `astro.config.mjs` with React integration
✅ Updated `package.json` with Astro dependencies
✅ Created base Astro layout (`src/layouts/BaseLayout.astro`)
✅ Converted header components to Astro
✅ Created example page structure

### Next Steps:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Convert remaining includes**:
   - Convert `_includes/footer-overheid.njk` → `src/components/FooterOverheid.astro`
   - Convert `_includes/header-rijksoverheid.njk` → `src/components/HeaderRijksoverheid.astro`
   - Convert `_includes/side-nav-overheid.njk` → `src/components/SideNavOverheid.astro`
   - Convert other includes as needed

3. **Convert pages**:
   - Move HTML files from `moza/` to `src/pages/moza/`
   - Convert frontmatter and Nunjucks syntax to Astro
   - Update URL helpers (remove `| url` filter, use direct paths)

4. **Create React components**:
   Now you can create React components in `src/components/` with `.jsx` or `.tsx` extension!

### Using React Components in Astro:

**Create a React component** (`src/components/Button.jsx`):
```jsx
export default function Button({ text, variant = 'primary' }) {
  return (
    <button className={`button button--${variant}`}>
      {text}
    </button>
  );
}
```

**Use it in an Astro page**:
```astro
---
import Button from '../components/Button.jsx';
---

<BaseLayout title="My Page">
  <h1>Welcome</h1>
  <Button text="Click me" variant="primary" client:load />
</BaseLayout>
```

**Client directives**:
- `client:load` - Load immediately
- `client:idle` - Load when browser is idle
- `client:visible` - Load when visible
- `client:only="react"` - Only render on client

### Running the Project:

```bash
# Development
npm run dev

# Build
npm run build

# Preview production build
npm run preview
```

### Static Assets:

- Assets in `/assets/` are automatically available at `/assets/` in production
- CSS files should be imported in components or use `<link>` in layouts
- The `style/` directory is still available and can be imported

### Frontmatter Changes:

**Before (Eleventy/Nunjucks)**:
```html
---
title: "My Page"
---
{% include "header.njk" %}
<h1>{{ title }}</h1>
```

**After (Astro)**:
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
const title = "My Page";
---
<BaseLayout title={title}>
  <h1>{title}</h1>
</BaseLayout>
```

### URL Handling:

- Remove `| url` filters
- Use absolute paths starting with `/`
- Example: `{{ '/moza/' | url }}` → `/moza/`

## Benefits of Astro:

✅ Native React support with partial hydration
✅ Better performance (only ships JS for interactive components)
✅ Modern dev experience with Vite
✅ TypeScript support out of the box
✅ Component-based architecture
✅ Great DX with hot module replacement
