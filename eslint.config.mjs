// Lint the browser modules and build scripts.
import globals from "globals";

export default [
  {
    ignores: ["static/dist/**", "static/js/generated/**", "node_modules/**", "cloud/**", "standalone.html"],
  },
  {
    files: ["static/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "no-dupe-keys": "error",
      "no-redeclare": "error",
      "no-import-assign": "error",
    },
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
];

