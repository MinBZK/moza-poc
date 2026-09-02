# Frontmatter Layout Control

Pages use YAML frontmatter to configure their layout variant.

## Available keys

| Key | Purpose | Default |
|---|---|---|
| `title` | Page `<title>` | (required) |
| `headerType` | Header variant: `"overheid"` or omit for rijksoverheid | rijksoverheid |
| `footerType` | Footer variant: `"overheid"` or omit for empty footer | empty |
| `bodyClass` | CSS class on `<body>` (e.g., `"moza"`) | none |

## Example

```yaml
---
title: "MijnOverheid Zakelijk: Bedrijfsgegevens"
---
```

The base layout (`_includes/base.njk`) reads these keys to conditionally include the correct header/footer templates.

## How it works

```nunjucks
{% if headerType == "overheid" %}
  {% include "header-overheid.njk" %}
{% else %}
  {% include "header-rijksoverheid.njk" %}
{% endif %}
```

- New layout variants = new template file + new frontmatter value
- Keep the base layout thin, logic stays in the included templates
