# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-02

### Added
- Initial release of httix — a zero-dependency, type-safe HTTP client built on native Fetch.
- Full HTTP method support (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS).
- `createHttix()` factory function and pre-configured default instance export.
- Request/Response interceptors with `use()`, `eject()`, and `clear()` methods.
- Automatic retry with exponential, linear, and fixed backoff strategies.
- Configurable jitter to prevent thundering herd.
- Custom retry conditions and callbacks.
- Timeout support via `AbortController` (default: 30s).
- Request cancellation with `AbortSignal` and `cancelAll()`.
- SSE (Server-Sent Events) streaming via `httix.stream.sse()`.
- NDJSON streaming via `httix.stream.ndjson()`.
- Request deduplication with configurable TTL and custom key generation.
- Client-side rate limiting with configurable window size.
- Koa-style middleware pipeline via `use()`.
- Auth helpers: Bearer (with token refresh), Basic, and API Key (header or query).
- Auto-pagination with offset, cursor, and Link header styles.
- LRU response caching plugin with stale-while-revalidate support.
- Structured logging plugin with configurable log levels.
- Mock adapter plugin for testing with fluent handler registration and request history.
- Query parameter serialization (objects, arrays, null/undefined filtering).
- Path parameter interpolation (`:paramName` syntax).
- Deep configuration merging for client and per-request configs.
- Response timing measurement.
- Error hierarchy: `HttixError`, `HttixRequestError`, `HttixResponseError`, `HttixTimeoutError`, `HttixAbortError`, `HttixRetryError`.
- TypeScript-first design with 100% type coverage.
- ESM and CJS dual output via tsup.
- 100% test coverage with Vitest.
