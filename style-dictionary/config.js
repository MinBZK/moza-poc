import { register } from '@tokens-studio/sd-transforms';
import StyleDictionary from 'style-dictionary';

const sd = new StyleDictionary({

  source: ["../tokens/tokens.json"],

  log: {
    verbosity: "verbose"
  },

  preprocessors: ["tokens-studio"],

  platforms: {

    css: {
      buildPath: "../style/",
      transformGroup: "tokens-studio",
      "transforms": [
        "name/kebab",
        "size/pxToRem"
      ],
      files: [
        {
          destination: "../style/_variables.css",
          format: "css/variables",
          "options": {
            "showFileHeader": false
          }
        }
      ]
    }
    
  }
});

register(sd, {
  excludeParentKeys: true,
});

await sd.buildAllPlatforms();