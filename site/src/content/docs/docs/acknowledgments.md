---
title: "Acknowledgments"
description: "Credits and dependencies"
---

Duck-UI wouldn't be possible without the amazing open-source community and the incredible tools built by talented developers worldwide.

## Core Technologies

### DuckDB

A huge thank you to the [DuckDB](https://duckdb.org/) team for creating this incredible analytical database system and making it available as WebAssembly. DuckDB's performance, SQL compatibility, and developer-friendly approach make it a joy to work with.

- **Website**: [duckdb.org](https://duckdb.org/)
- **GitHub**: [github.com/duckdb/duckdb](https://github.com/duckdb/duckdb)
- **WASM**: [github.com/duckdb/duckdb-wasm](https://github.com/duckdb/duckdb-wasm)

## Key Dependencies

### UI Framework & Styling

- **[Svelte 5](https://svelte.dev/)** - The foundation of the user interface, with runes for state
- **[Tailwind CSS 4](https://tailwindcss.com/)** - Utility-first styling on top of a small set of design tokens
- **[Lucide](https://lucide.dev/)** - The icon set, through `lucide-svelte`
- **[svelte-sonner](https://github.com/wobsoriano/svelte-sonner)** - Toast notifications

### Code Editor

- **[CodeMirror 6](https://codemirror.net/)** - The SQL, markdown and Python editors: completion, search, folding, and the collaborative binding
- **[sql-formatter](https://github.com/sql-formatter-org/sql-formatter)** - DuckDB dialect formatting

### Charts and Maps

- **[uPlot](https://github.com/leeoniya/uPlot)** - Fast canvas charts for bar, line, area and scatter
- **[MapLibre GL](https://maplibre.org/)** - Maps for GEOMETRY results

### Data Handling

- **[Apache Arrow](https://arrow.apache.org/)** - Columnar results between DuckDB and the grid
- **[ExcelJS](https://github.com/exceljs/exceljs)** - XLSX export
- **[fflate](https://github.com/101arrowz/fflate)** - Zip files for project export and import
- **[Zod](https://zod.dev/)** - Schema validation for everything that crosses a boundary

### Collaboration and AI

- **[Yjs](https://yjs.dev/)** - Character-level merging for live sessions
- **[WebLLM](https://webllm.mlc.ai/)** - In-browser language models for Duck Brain
- **[Pyodide](https://pyodide.org/)** - Python cells in notebooks, loaded on first use

### Markdown

- **[marked](https://marked.js.org/)** - Markdown rendering for dashboards, notebooks and Duck Brain replies
- **[DOMPurify](https://github.com/cure53/DOMPurify)** - Sanitizes every rendered HTML fragment

### Build Tools

- **[Vite](https://vitejs.dev/)** - Build tool and dev server
- **[Bun](https://bun.sh/)** - JavaScript runtime and package manager
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety and developer experience
- **[Vitest](https://vitest.dev/)** and **[Playwright](https://playwright.dev/)** - Unit and end-to-end tests

### Design

- The look, fonts and UI primitives are shared with [CH-UI](https://ch-ui.com), the ClickHouse workbench by the same author.

## Documentation

- **[Fumadocs](https://fumadocs.vercel.app/)** - Modern documentation framework powering this documentation

## Inspiration & Community

Thank you to everyone who:
- Reported bugs and issues
- Suggested features and improvements
- Contributed code and documentation
- Shared Duck-UI with others
- Provided feedback and encouragement

## Special Thanks

### Sponsors

We're grateful to our sponsors who support the development of Duck-UI:

- **[QXIP](https://qxip.net/)** - Next-gen telecom observability

Interested in sponsoring Duck-UI? [Contact us](mailto:caio.ricciuti+sponsorship@outlook.com?subject=DUCK-UI%20Sponsorship%20Inquiry)

### Contributors

Thank you to all the contributors who have helped improve Duck-UI:

- [View all contributors on GitHub](https://github.com/caioricciuti/duck-ui/graphs/contributors)

## Open Source

Duck-UI is proudly open source and released under the MIT License. We believe in the power of open-source software and are committed to contributing back to the community.

## Want to Contribute?

We welcome contributions of all kinds:

- **Bug Reports**: [Open an issue](https://github.com/caioricciuti/duck-ui/issues)
- **Feature Requests**: [Start a discussion](https://github.com/caioricciuti/duck-ui/discussions)
- **Documentation**: Help improve our docs
- **Code**: Submit a pull request
- **Support**: Star the project on GitHub

Every contribution, no matter how small, helps make Duck-UI better for everyone.

---

## Standing on the Shoulders of Giants

Duck-UI is built using dozens of open-source libraries and tools. While we can't list every dependency here, we're deeply grateful to every maintainer and contributor in the JavaScript, Svelte, and DuckDB ecosystems.

**Thank you all!**

---

[View Full License](/docs/license)
