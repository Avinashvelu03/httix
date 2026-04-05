# Contributing to httix-http

Thank you for your interest in contributing to httix-http! This guide covers everything you need to get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

## Code of Conduct

This project and everyone participating in it is governed by the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to abide by its terms.

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **npm**, **yarn**, **pnpm**, or **bun** (any package manager)

### Setup

1. **Fork** the repository on GitHub.

2. **Clone** your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/httix-http.git
cd httix-http
```

3. **Install** dependencies:

```bash
npm install
```

4. **Verify** the setup works:

```bash
npm run audit
```

This runs linting, type-checking, tests with coverage, and a production build.

## Development Workflow

1. **Create a branch** from `main`:

```bash
git checkout -b feat/my-feature
# or
git checkout -b fix/my-bugfix
```

2. **Make your changes** and write/update tests.

3. **Run checks** as you develop:

```bash
# Type-check
npm run typecheck

# Lint
npm run lint

# Run tests
npm run test

# Watch mode (auto-rerun on changes)
npm run test:watch
```

4. **Run the full audit** before pushing:

```bash
npm run audit
```

### Building

```bash
# Production build (ESM + CJS)
npm run build

# Clean build artifacts
npm run clean
```

## Project Structure

```
httix/
├── src/
│   ├── index.ts              # Main entry point & default instance
│   ├── core/
│   │   ├── types.ts          # TypeScript types & interfaces
│   │   ├── client.ts         # HttixClientImpl & createHttix
│   │   ├── defaults.ts       # Default configuration values
│   │   ├── errors.ts         # Error class hierarchy
│   │   ├── request.ts        # Request building & fetch execution
│   │   └── response.ts       # Response parsing & creation
│   ├── features/
│   │   ├── interceptors.ts   # Interceptor manager & execution
│   │   ├── retry.ts          # Retry with backoff strategies
│   │   ├── timeout.ts        # Timeout via AbortController
│   │   ├── abort.ts          # Cancel tokens
│   │   ├── dedup.ts          # Request deduplication
│   │   ├── rateLimit.ts      # Client-side rate limiting
│   │   ├── middleware.ts      # Middleware pipeline
│   │   ├── auth.ts           # Auth helpers (Bearer, Basic, API Key)
│   │   ├── streaming.ts      # SSE & NDJSON parsers
│   │   └── pagination.ts     # Auto-pagination (offset, cursor, link)
│   ├── methods/
│   │   ├── get.ts            # GET method factory
│   │   ├── post.ts           # POST method factory
│   │   ├── put.ts            # PUT method factory
│   │   ├── patch.ts          # PATCH method factory
│   │   ├── delete.ts         # DELETE method factory
│   │   ├── head.ts           # HEAD method factory
│   │   ├── options.ts        # OPTIONS method factory
│   │   └── request.ts        # Generic request method factory
│   ├── plugins/
│   │   ├── index.ts          # Plugin re-exports
│   │   ├── logger.ts         # Logger plugin
│   │   ├── cache.ts          # LRU cache plugin
│   │   └── mock.ts           # Mock adapter plugin
│   └── utils/
│       ├── merge.ts          # Deep config merging
│       └── helpers.ts        # Utility functions
├── tests/                    # Test files
├── package.json
├── tsconfig.json
└── tsup.config.ts            # Build configuration
```

## Coding Standards

- **TypeScript**: All code is written in strict TypeScript. Use proper types everywhere — avoid `any`.
- **Formatting**: We use [Prettier](https://prettier.io) for consistent formatting. Run `npm run format` before committing.
- **Linting**: We use [ESLint](https://eslint.org) with `@typescript-eslint`. Run `npm run lint` to check.
- **No `any`**: Use `unknown` and type narrowing instead.
- **JSDoc**: Public APIs must have JSDoc comments describing parameters, return types, and usage examples.
- **Zero dependencies**: httix has zero runtime dependencies. Do not introduce new dependencies without explicit approval.

## Testing

We use [Vitest](https://vitest.dev) and aim for 100% test coverage.

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage report
npm run test:coverage

# Run a specific test file
npx vitest run tests/core/client.test.ts
```

### Writing Tests

- Place tests in `tests/` mirroring the `src/` structure.
- Use descriptive test names: `it('should retry on 503 and succeed on third attempt', ...)`.
- Test both happy paths and error cases.
- Use the `mockPlugin` for unit tests instead of hitting real endpoints.
- Test edge cases: empty bodies, null values, timeout races, concurrent dedup, etc.

### Test Structure

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHttix } from 'httix-http';
import { mockPlugin } from 'httix-http/plugins';

describe('Feature name', () => {
  const mock = mockPlugin();
  const client = createHttix({ baseURL: 'https://api.example.com' });

  afterEach(() => {
    mock.restore();
  });

  it('should describe the expected behavior', async () => {
    mock.onGet('/endpoint').reply(200, { data: 'value' });

    const { data, status } = await client.get('/endpoint');

    expect(status).toBe(200);
    expect(data).toEqual({ data: 'value' });
  });
});
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code style changes (formatting, semicolons, etc.) |
| `refactor` | Code changes that neither fix a bug nor add a feature |
| `perf` | Performance improvements |
| `test` | Adding or updating tests |
| `chore` | Build process, tooling, or dependency changes |
| `ci` | CI/CD configuration changes |

### Examples

```
feat(interceptors): add request/response interceptor support
fix(retry): resolve exponential backoff jitter calculation
docs(readme): add migration guide from axios
test(cache): add stale-while-revalidate tests
chore(deps): update vitest to v2.2
```

## Pull Request Process

1. **Update documentation** if your PR changes or adds functionality (README, JSDoc, type exports).
2. **Add tests** for any new or changed behavior. All tests must pass with `npm run audit`.
3. **Keep PRs focused** — one feature or fix per PR when possible.
4. **Squash commits** into a single conventional commit before merging.
5. **Respond to review** feedback promptly. Be open to suggestions.
6. **Ensure CI passes** before requesting review.

### PR Checklist

- [ ] Code compiles (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)
- [ ] All tests pass (`npm test`)
- [ ] Coverage maintained at 100% (`npm run test:coverage`)
- [ ] Documentation updated (README, JSDoc)
- [ ] Conventional commit messages used
- [ ] No new runtime dependencies added

## Reporting Bugs

Please open a [GitHub Issue](https://github.com/Avinashvelu03/httix/issues) with:

1. **httix-http version** you're using.
2. **Node.js version** and runtime (Node, Deno, Bun, browser).
3. **Minimal reproducible example** — a small code snippet that demonstrates the issue.
4. **Expected behavior** — what you expected to happen.
5. **Actual behavior** — what actually happened (including error messages/stack traces).

## Feature Requests

Open a [GitHub Issue](https://github.com/Avinashvelu03/httix/issues) with the `enhancement` label and describe:

1. **The use case** — what problem does this solve?
2. **Proposed API** — how would you like it to work?
3. **Alternatives** — any workarounds you've tried.

We're open to all ideas, but please understand that not every request can be accepted. We'll do our best to respond promptly.

---

Thank you for contributing to httix-http! 🚀
