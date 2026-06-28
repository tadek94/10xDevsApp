/**
 * dependency-cruiser config — 10xCards
 * Plik jest CommonJS (.cjs), bo package.json ma "type": "module".
 * Docs: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
 *
 * Zakres: warstwa TypeScript (src/**: API routes, lib/services, hooki, komponenty React).
 * Pliki .astro są wyłączone — dependency-cruiser nie parsuje natywnie formatu .astro,
 * więc szablony/strony traktujemy jako entry-pointy poza grafem importów.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "warn",
      comment: "Cykl w zależnościach utrudnia refaktor, testowanie i tree-shaking.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment: "Moduł, którego nikt nie importuje i który sam nic nie wnosi — kandydat do usunięcia.",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+\\.(c|m)?(j|t)s$", // dot-pliki konfiguracyjne
          "\\.d\\.ts$", // deklaracje typów
          "(^|/)(astro|vitest|eslint|prettier|tailwind)\\.config\\.[^/]+$",
          "(^|/)src/env\\.d\\.ts$",
          "^src/pages/", // strony i endpointy API — entry-pointy file-based routingu Astro
          "^src/middleware\\.ts$", // middleware — entry-point Astro
        ],
      },
      to: {},
    },
    {
      name: "not-to-dev-dep",
      severity: "warn",
      comment: "Kod produkcyjny nie powinien zależeć od devDependencies.",
      from: { path: "^src", pathNot: "\\.(test|spec)\\.(t|j)sx?$" },
      to: {
        dependencyTypes: ["npm-dev"],
        pathNot: ["node_modules/@types/"],
      },
    },
    {
      name: "no-deprecated-core",
      severity: "warn",
      comment: "Nie korzystaj z przestarzałych modułów core Node.js.",
      from: {},
      to: { dependencyTypes: ["core"], path: ["^(punycode|domain|sys|querystring|_linklist)$"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: "(^|/)(dist|node_modules|coverage|playwright-report|test-results|\\.astro)(/|$)|\\.astro$",
    },
    // Honoruje alias @/* -> ./src/* z tsconfig.json
    tsConfig: { fileName: "tsconfig.json" },
    // Uwzględnij importy znikające po kompilacji TS (np. import type)
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"],
      mainFields: ["module", "main", "types", "typings"],
    },
    reporterOptions: {
      dot: { collapsePattern: "node_modules/(@[^/]+/[^/]+|[^/]+)" },
      // Widok "archi": zwija do podkatalogów src/* (core view)
      archi: { collapsePattern: "^src/[^/]+" },
    },
  },
};
