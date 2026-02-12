import { register } from '@tokens-studio/sd-transforms';
import StyleDictionary from 'style-dictionary';
import { readFile, writeFile, mkdir } from 'fs/promises';

register(StyleDictionary); // No excludeParentKeys needed for merged file

StyleDictionary.registerFileHeader({
  name: 'custom-header',
  fileHeader: () => {
    return [
      'Automatisch gegenereerd op basis van design tokens.',
      'De bron is tokens.json uit de MOx repository.',
      `Gegenereerd op ${new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })}`,
      '_rijkshuisstijl.css bevat opties uit de Rijkshuisstijl, _mox.css bevat de toepassing van deze opties. Refereer in het CSS bestand alleen aan de variabelen in _mox.css, niet aan die in _rijkshuisstijl.css.',
      'CSS variabelen worden automatisch gegenereerd, bewerk deze niet handmatig.',
    ];
  },
});

StyleDictionary.registerFormat({
  name: 'css/variables-sorted',
  format: async (args) => {
    // Let the built-in format handle everything (references, values, header)
    const builtIn = StyleDictionary.hooks.formats['css/variables'];
    const output = await builtIn(args);

    // Extract header, opening, variables, and closing
    const lines = output.split('\n');
    const headerLines = [];
    const varLines = [];
    let inRoot = false;

    for (const line of lines) {
      if (line.startsWith(':root')) {
        inRoot = true;
        continue;
      }
      if (line === '}') {
        inRoot = false;
        continue;
      }
      if (inRoot) {
        varLines.push(line);
      } else if (!inRoot && varLines.length === 0) {
        headerLines.push(line);
      }
    }

    varLines.sort((a, b) => a.trim().localeCompare(b.trim()));

    return headerLines.join('\n') + ':root {\n' + varLines.join('\n') + '\n}\n';
  },
});

StyleDictionary.registerTransform({
  name: 'size/remToPxExceptions',
  type: 'value',
  filter: (token) => {
    const path = token.path.join('.');
    return (path.includes('border-width') || path.includes('border-radius'));
  },
  transform: (token) => {
    const val = `${token.value ?? token.$value}`;
    if (val.endsWith('rem')) {
      const rem = parseFloat(val);
      return `${rem * 16}px`;
    }
    return val;
  },
});


function isToken(obj) {
  return obj && typeof obj === 'object' && ('value' in obj || '$value' in obj);
}

function deepMerge(base, override) {
  const result = { ...base };
  for (const [key, val] of Object.entries(override)) {
    if (!(key in result)) {
      result[key] = val;
    } else if (isToken(val) && !isToken(result[key]) && typeof result[key] === 'object') {
      // override is a leaf, base is a group → keep the group
      continue;
    } else if (!isToken(val) && typeof val === 'object' && !isToken(result[key]) && typeof result[key] === 'object') {
      result[key] = deepMerge(result[key], val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

function buildTokenSetMap(sets) {
  const map = {};
  for (const [setName, setTokens] of Object.entries(sets)) {
    function recurse(obj, path) {
      for (const [key, val] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        if (isToken(val)) {
          map[currentPath] = setName;
        } else if (val && typeof val === 'object') {
          recurse(val, currentPath);
        }
      }
    }
    recurse(setTokens, '');
  }
  return map;
}

async function run() {
  const tokens = JSON.parse(await readFile('../tokens/tokens.json', 'utf-8'));
  const { $themes, $metadata, ...sets } = tokens;

  console.log('Sets:', Object.keys(sets));

  const tokenSetMap = buildTokenSetMap(sets);

  // Get the tokens-studio transforms and remove their px-to-rem
const tsTransforms = StyleDictionary.hooks.transformGroups['tokens-studio']
  .filter(t => t !== 'ts/size/px');

console.log('Filtered transforms:', tsTransforms);

  // Deep merge: rijkshuisstijl first, then mox on top (preserving groups)
  const setNames = Object.keys(sets);
  let merged = {};
  for (const setName of setNames) {
    merged = deepMerge(merged, sets[setName]);
  }

  await mkdir('tokens', { recursive: true });
  await writeFile('tokens/merged.json', JSON.stringify(merged, null, 2), 'utf-8');

  StyleDictionary.registerTransform({
    name: 'name/prefix-set',
    type: 'name',
    transform: (token) => {
      const tokenPath = token.path.join('.');
      const setName = tokenSetMap[tokenPath] || 'unknown';
      return `${setName}-${token.name}`;
    },
  });

  const sd = new StyleDictionary({
    source: ['tokens/merged.json'],
    preprocessors: ['tokens-studio'],
    log: {
      verbosity: 'silent',
      errors: {
        brokenReferences: 'console',
      },
    },
    platforms: {
      css: {
        // transformGroup: 'tokens-studio',
        transforms: [  ...StyleDictionary.hooks.transformGroups['tokens-studio'], 'name/kebab', 'size/pxToRem', 'size/remToPxExceptions', 'name/prefix-set'],
        files: setNames.map(setName => ({
          destination: `../style/_${setName}.css`,
          format: 'css/variables-sorted',
          filter: (token) => {
            const tokenPath = token.path.join('.');
            return tokenSetMap[tokenPath] === setName;
          },
          options: {
            fileHeader: 'custom-header',
            outputReferences: setName === 'mox',
          },
        })),
      },
    },
  });

  await sd.cleanAllPlatforms();
  await sd.buildAllPlatforms();
}

run();