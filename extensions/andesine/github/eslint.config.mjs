import eslint from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";
import tseslint from "typescript-eslint";

const codeFiles = ["**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}"];
const javascriptFiles = ["**/*.{cjs,js,jsx,mjs}"];
const typescriptFiles = ["**/*.{cts,mts,ts,tsx}"];

export default tseslint.config(
  {
    ignores: [".andesine/**", ".wrangler/**", "dist/**", "node_modules/**"]
  },
  {
    ...eslint.configs.recommended,
    files: javascriptFiles,
    languageOptions: {
      globals: globals.node
    }
  },
  ...tseslint.configs.recommended,
  {
    files: codeFiles,
    rules: {
      "no-void": ["error", { allowAsStatement: true }],
      "max-lines": [
        "warn",
        {
          max: 400,
          skipBlankLines: true,
          skipComments: true
        }
      ]
    }
  },
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true }],
      "@typescript-eslint/no-meaningless-void-operator": ["error"],
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          fixStyle: "inline-type-imports",
          prefer: "type-imports"
        }
      ],
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ]
    }
  },
  prettier
);
