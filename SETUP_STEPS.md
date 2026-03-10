# Move static assets to public directory

You'll need to move your static assets to work with Astro:

```bash
# Create public directory
mkdir -p public

# Move static assets
mv assets public/
mv style public/
mv tokens public/
mv gebruikersonderzoek public/

# These will be accessible at /assets/, /style/, /tokens/, /gebruikersonderzoek/ in your site
```

Or update astro.config.mjs to use a custom public directory structure.
