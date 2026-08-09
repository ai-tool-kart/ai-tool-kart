# AI Tool Kart

## Product Overview

AI Tool Kart is a discovery platform for AI tools.

The website helps users discover, explore, compare, and evaluate AI tools across different categories and use cases.

The product should feel modern, clean, fast, and easy to browse.

The existing UI has already been designed in Claude Design and is the visual source of truth for the frontend implementation.

Do not redesign the product unless explicitly requested.

---

## Primary User Goal

A user should be able to visit AI Tool Kart and quickly answer questions such as:

- What AI tools exist for a particular task?
- Which tools are useful for writing, coding, design, productivity, research, video, image generation, etc.?
- What does a particular tool do?
- Is the tool free, freemium, or paid?
- What category does the tool belong to?
- Where can I access the tool?
- What are similar or related tools?

The browsing experience should be simple and discovery-focused.

---

## Core Product Areas

The website is expected to contain areas such as:

- Homepage
- Tool discovery/browsing
- Search
- Categories
- Tool cards
- Individual tool detail pages
- Filtering
- Related/recommended tools

Additional functionality may be added later.

Do not assume future features exist unless explicitly requested.

---

## Tool Data

An AI tool may eventually contain information such as:

- name
- slug
- logo
- short description
- full description
- website URL
- category
- tags
- pricing model
- featured status
- verification status
- screenshots/images
- related tools

The exact database schema will be designed later.

For now, frontend implementations may use mock data where necessary.

Do not build the production database yet unless explicitly instructed.

---

## Current Development Phase

We are currently implementing the existing Claude Design UI as a real React application.

Current priority:

1. reproduce the Claude Design accurately
2. create reusable React components
3. establish a clean frontend architecture
4. make the UI responsive
5. ensure the application builds and runs correctly

Backend development will begin after the frontend foundation is stable.

---

## Frontend Stack

- React
- TypeScript
- Vite
- Tailwind CSS

Do NOT migrate the project to:

- Next.js
- Vue
- Angular
- Svelte
- another frontend framework

unless explicitly instructed.

---

## Planned Backend Stack

Backend development will be implemented later using:

- Node.js
- Express
- TypeScript
- PostgreSQL
- Prisma

Potential validation:

- Zod

Authentication architecture will be decided later.

Do not implement backend systems unless explicitly requested.

---

## Repository Structure

The repository should evolve toward:

ai-tool-kart/
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── assets/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── utils/
│   └── ...
│
├── server/
│   └── ...
│
├── CLAUDE.md
└── README.md

Frontend code belongs inside `client/`.

Backend code will later belong inside `server/`.

---

## Design Source of Truth

The Claude Design project is the visual source of truth.

When implementing UI:

- preserve layout
- preserve spacing
- preserve typography
- preserve colors
- preserve border radii
- preserve shadows
- preserve component proportions
- preserve responsive behavior
- preserve interaction patterns

Do not arbitrarily "improve" or redesign visual elements.

If implementation requires deviating from the design, explain why before doing so.

---

## Component Architecture

Prefer reusable React components.

Examples may include:

- Navbar
- SearchBar
- ToolCard
- CategoryCard
- CategoryChip
- FilterControls
- ToolGrid
- ToolDetails
- Footer

Do not create one extremely large `App.tsx` containing the entire application.

Repeated interface patterns should become reusable components.

Avoid premature abstraction when something is only used once.

---

## TypeScript Rules

Use TypeScript properly.

Avoid using `any` unless absolutely necessary.

Prefer explicit interfaces/types for important data structures.

Example:

interface Tool {
  id: string
  name: string
  description: string
}

Shared domain types should eventually live inside an appropriate `types/` directory.

---

## Styling Rules

Use the styling approach established by the project.

Prefer Tailwind CSS where appropriate.

Do not introduce additional styling frameworks such as:

- Bootstrap
- Material UI
- Chakra UI

unless explicitly requested.

Do not replace the visual design with a component library.

---

## Dependencies

Do not install packages unnecessarily.

Before adding a dependency:

1. verify that the functionality cannot be implemented reasonably with existing tools
2. explain what the dependency does
3. explain why it is needed

Avoid large dependencies for trivial functionality.

---

## Development Behaviour

Before modifying an existing feature:

1. inspect the relevant files
2. understand the current implementation
3. identify reusable components
4. consider whether the change affects other parts of the application

For substantial changes, explain the intended approach before modifying many files.

Do not rewrite large sections of working code without a clear reason.

---

## Build Quality

Before considering a task complete:

- TypeScript should compile
- the application should build
- the development server should run
- there should be no obvious console errors
- existing working functionality should remain intact

Run appropriate checks after meaningful changes.

---

## Git Safety

Do not perform destructive Git operations.

Do not:

- force push
- delete branches
- reset commits
- rewrite Git history

unless explicitly instructed.

The developer will handle commits and pushes unless requested otherwise.

---

## Current Instruction Priority

At this stage:

Design accuracy > feature expansion.

Frontend architecture > backend development.

Simple maintainable code > unnecessary complexity.

Do not build features that were not requested.