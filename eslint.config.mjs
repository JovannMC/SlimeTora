import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["dist/**", "release/**", "node_modules/**", "src/renderer/.svelte-kit/**", "src/renderer/build/**"],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["src/main/**/*.ts", "src/preload/**/*.ts", "scripts/**/*.mjs"],
        languageOptions: { globals: { ...globals.node } },
    },
    {
        files: ["src/renderer/src/**/*.ts"],
        languageOptions: { globals: { ...globals.browser } },
    },
    {
        files: ["src/shared/**/*.ts"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        { group: ["node:*"], message: "src/shared must not depend on Node APIs." },
                        { group: ["electron"], message: "src/shared must not depend on Electron." },
                        {
                            group: ["../main/*", "$shared/**/main/*"],
                            message: "src/shared must not depend on the main process.",
                        },
                    ],
                },
            ],
        },
    },
    {
        rules: {
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
        },
    },
    prettier,
);
