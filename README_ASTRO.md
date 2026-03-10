# MijnOverheid Zakelijk - Astro Migration

This project has been successfully migrated from Eleventy to Astro with React support!

## 🚀 Quick Start

```bash
# Install dependencies (already done)
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📁 Project Structure

```
/
├── src/
│   ├── components/      # Astro and React components
│   │   ├── Button.tsx   # Example React component
│   │   ├── Accordion.tsx # Example interactive React component
│   │   ├── HeaderOverheid.astro
│   │   ├── HeaderRijksoverheid.astro
│   │   └── FooterOverheid.astro
│   ├── layouts/
│   │   └── BaseLayout.astro  # Main layout template
│   └── pages/           # File-based routing
│       ├── index.astro  # Homepage
│       └── moza/
│           └── index.astro
├── public/              # Static assets (copied at build)
│   ├── assets/
│   ├── style/
│   ├── tokens/
│   └── gebruikersonderzoek/
├── _site/              # Build output
└── astro.config.mjs    # Astro configuration
```

## 🎯 Using React Components

### Creating a React Component

Create a `.tsx` or `.jsx` file in `src/components/`:

```tsx
// src/components/MyButton.tsx
import React from 'react';

interface MyButtonProps {
  text: string;
  onClick?: () => void;
}

export default function MyButton({ text, onClick }: MyButtonProps) {
  return (
    <button onClick={onClick} className="my-button">
      {text}
    </button>
  );
}
```

### Using React in Astro Pages

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import MyButton from '../components/MyButton.tsx';
---

<BaseLayout title="My Page">
  <h1>Welcome</h1>
  
  <!-- Static (no JS shipped) -->
  <MyButton text="Static Button" />
  
  <!-- Interactive (includes React runtime) -->
  <MyButton text="Click Me" client:load onClick={() => alert('Clicked!')} />
</BaseLayout>
```

### Client Directives

- `client:load` - Hydrate immediately on page load
- `client:idle` - Hydrate when browser is idle
- `client:visible` - Hydrate when component is visible
- `client:media="(max-width: 768px)"` - Hydrate based on media query
- `client:only="react"` - Skip server rendering, only render on client

## 🔄 Migration from Eleventy

### Key Changes

| Eleventy | Astro |
|----------|-------|
| `.njk` files | `.astro` files |
| `{% include %}` | `import` + `<Component />` |
| `{{ variable }}` | `{variable}` |
| `{{ path \| url }}` | Direct path `/path` |
| `_includes/` | `src/components/` & `src/layouts/` |
| Root HTML files | `src/pages/` |

### Converting Templates

**Before (Nunjucks)**:
```njk
---
title: My Page
---
{% include "header.njk" %}
<h1>{{ title }}</h1>
<a href="{{ '/moza/' | url }}">Link</a>
```

**After (Astro)**:
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="My Page">
  <h1>My Page</h1>
  <a href="/moza/">Link</a>
</BaseLayout>
```

## 🛠️ Available Scripts

- `npm run dev` - Start dev server with hot reload + token watching
- `npm run build` - Build tokens and site for production
- `npm run build:tokens` - Rebuild design tokens
- `npm run preview` - Preview production build locally
- `npm run storybook` - Start Storybook (existing)

## 📝 Next Steps

1. **Convert remaining pages**: Move HTML files from `moza/`, `componenten/`, etc. to `src/pages/`
2. **Convert includes**: Migrate remaining Nunjucks includes to Astro components
3. **Add interactivity**: Replace static components with React where needed
4. **Clean up**: Remove old Eleventy files once migration is complete

## 🎨 Design Tokens

The design token workflow remains the same:
- Edit `tokens/tokens.json`
- Tokens auto-rebuild on change (in dev mode)
- CSS variables generated in `public/style/`

## 📚 Resources

- [Astro Documentation](https://docs.astro.build)
- [Astro + React Guide](https://docs.astro.build/en/guides/integrations-guide/react/)
- [Migration Guide](./ASTRO_MIGRATION.md)

## 🤝 Need Help?

Check `ASTRO_MIGRATION.md` for detailed migration instructions and examples.
