<p align="center">
  <img src="https://img.shields.io/npm/v/httix-http?style=flat-square&color=blue" alt="npm version" />
  <img src="https://img.shields.io/npm/l/httix?style=flat-square&color=green" alt="MIT License" />
  <img src="https://img.shields.io/badge/TypeScript-5.7+-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/bundle_size-~5kB_min%2Bgzip-orange?style=flat-square" alt="Bundle Size" />
  <img src="https://img.shields.io/badge/zero_dependencies-brightgreen?style=flat-square" alt="Zero Dependencies" />
  <img src="https://img.shields.io/badge/coverage-100%25-success?style=flat-square" alt="100% Coverage" />
      <img src="https://img.shields.io/github/stars/Avinashvelu03/httix-http?style=flat-square&color=yellow" alt="GitHub Stars" />
</p>

<h1 align="center">httix-http</h1>

<p align="center">
  <strong>Ultra-lightweight, type-safe, zero-dependency HTTP client built on native Fetch.</strong><br/>
  The modern axios replacement for the JavaScript ecosystem.
</p>

---

## Why httix-http?

| Feature | **httix-http** | axios | got | ky | ofetch |
|---|---|---|---|---|---|
| Dependencies | **0** | 2 | 11 | 2 | 5 |
| Size (min+gzip) | **~5 kB** | ~28 kB | ~67 kB | ~9 kB | ~12 kB |
| Built on Fetch API | ✅ | ❌ | ❌ | ✅ | ✅ |
| TypeScript native | ✅ | ⚠️ (v1 types) | ✅ | ✅ | ✅ |
| Interceptors | ✅ | ✅ | ✅ | ❌ | ✅ |
| Retry with backoff | ✅ | ❌ (plugin) | ✅ | ✅ | ✅ |
| Request deduplication | ✅ | ❌ | ❌ | ❌ | ✅ |
| Rate limiting | ✅ | ❌ | ❌ | ❌ | ❌ |
| Middleware pipeline | ✅ | ❌ | ❌ | ❌ | ❌ |
| Auth helpers | ✅ | ❌ (plugin) | ✅ | ❌ | ❌ |
| Auto-pagination | ✅ | ❌ | ✅ | ❌ | ❌ |
| SSE / NDJSON streaming | ✅ | ❌ | ✅ | ❌ | ❌ |
| Cache plugin | ✅ | ❌ (adapter) | ✅ | ✅ | ✅ |
| Mock plugin (testing) | ✅ | ✅ (adapter) | ✅ | ❌ | ❌ |
| Response timing | ✅ | ❌ | ✅ | ❌ | ❌ |
| Cancel all requests | ✅ | ⚠️ (manual) | ✅ | ✅ | ❌ |
| ESM + CJS | ✅ | ✅ | ❌ (ESM) | ✅ | ✅ |
| Runtime agnostic | ✅ | ✅ | Node only | Browser | Universal |

## Installation

```bash
# npm
npm install httix-http

# yarn
yarn add httix-http

# pnpm
pnpm add httix-http

# bun
bun add httix-http
```

## Quick Start

### 1. Simple GET request

```ts
import httix from 'httix-http';

const { data, status, timing } = await httix.get('/users');
console.log(data); // parsed JSON response
console.log(status); // 200
console.log(timing); // request duration in ms
```

### 2. POST with JSON body

```ts
import httix from 'httix-http';

const { data } = await httix.post('/users', {
  name: 'Avinash',
  email: 'avinash@example.com',
});

console.log(data.id); // created user id
```

### 3. Create a configured client

```ts
import { createHttix } from 'httix-http';

const api = createHttix({
  baseURL: 'https://api.example.com',
  auth: { type: 'bearer', token: 'my-secret-token' },
  headers: { 'X-App-Version': '1.0.0' },
});

const { data } = await api.get('/users/me');
```

### 4. Error handling

```ts
import httix, { HttixResponseError, HttixTimeoutError, HttixAbortError } from 'httix-http';

try {
  const { data } = await httix.get('/users/999');
} catch (error) {
  if (error instanceof HttixResponseError) {
    console.error(`Server error: ${error.status} — ${error.statusText}`);
    console.error('Response body:', error.data);
  } else if (error instanceof HttixTimeoutError) {
    console.error(`Request timed out after ${error.timeout}ms`);
  } else if (error instanceof HttixAbortError) {
    console.error('Request was cancelled');
  }
}
```

### 5. Streaming SSE events

```ts
import httix from 'httix-http';

for await (const event of httix.stream.sse('/events')) {
  console.log(`[${event.type}] ${event.data}`);
  if (event.type === 'done') break;
}
```

---

## API Reference

### Creating Instances

#### `createHttix(config?)`

Create a new client instance with the given configuration. This is the recommended entry-point for creating dedicated API clients.

```ts
import { createHttix } from 'httix-http';

const api = createHttix({
  baseURL: 'https://api.example.com/v2',
  headers: {
    'X-App-Version': '1.0.0',
    'Accept-Language': 'en-US',
  },
  timeout: 15000,
  retry: { attempts: 5, backoff: 'exponential' },
  auth: { type: 'bearer', token: 'my-token' },
});

const { data } = await api.get('/users');
```

#### `httix.create(config?)`

Create a derived client from the default instance, merging new configuration with the defaults:

```ts
import httix from 'httix-http';

const adminApi = httix.create({
  baseURL: 'https://admin.api.example.com',
  auth: { type: 'bearer', token: adminToken },
});
```

#### Default instance

A pre-configured default instance is exported for convenience:

```ts
import httix from 'httix-http';

// Use directly
await httix.get('/users');

// Destructure
const { get, post, put, patch, delete: remove } = httix;
await get('/users');
```

### HTTP Methods

All methods return `Promise<HttixResponse<T>>` and support a generic type parameter for the response body.

#### `httix.get<T>(url, config?)`

```ts
const users = await httix.get<User[]>('/users');
console.log(users.data); // User[]

// With query parameters
const page = await httix.get<User[]>('/users', {
  query: { page: 1, limit: 20, active: true },
});
```

#### `httix.post<T>(url, body?, config?)`

```ts
const user = await httix.post<User>('/users', {
  name: 'Jane',
  email: 'jane@example.com',
});

// With FormData
const form = new FormData();
form.append('avatar', fileInput.files[0]);
const upload = await httix.post('/upload', form);
```

#### `httix.put<T>(url, body?, config?)`

```ts
const updated = await httix.put<User>('/users/1', {
  name: 'Jane Updated',
  email: 'jane@newdomain.com',
});
```

#### `httix.patch<T>(url, body?, config?)`

```ts
const patched = await httix.patch<User>('/users/1', { name: 'Jane v2' });
```

#### `httix.delete<T>(url, config?)`

```ts
const result = await httix.delete<{ deleted: boolean }>('/users/1');
console.log(result.data.deleted); // true
```

#### `httix.head(url, config?)`

```ts
const headers = await httix.head('/large-file.pdf');
console.log(headers.headers.get('content-length')); // "1048576"
```

#### `httix.options(url, config?)`

```ts
const allowed = await httix.options('/api');
console.log(allowed.headers.get('allow')); // "GET, POST, OPTIONS"
```

#### `httix.request<T>(config)`

The underlying method for all HTTP shortcuts. Use it for maximum control:

```ts
const { data } = await httix.request<User>({
  method: 'POST',
  url: '/users',
  body: { name: 'Jane' },
  headers: { 'X-Custom-Header': 'value' },
  timeout: 5000,
  retry: { attempts: 2 },
  query: { verify: true },
  responseType: 'json',
});
```

### The Response Object

Every method returns an `HttixResponse<T>`:

```ts
interface HttixResponse<T> {
  data: T;             // Parsed response body
  status: number;      // HTTP status code (e.g. 200)
  statusText: string;  // HTTP status text (e.g. "OK")
  headers: Headers;    // Native Headers object
  ok: boolean;         // true if status is 2xx
  raw: Response;       // Original Fetch Response
  timing: number;      // Request duration in ms
  config: HttixRequestConfig; // Config that produced this response
}
```

```ts
const response = await httix.get('/users');
console.log(response.data);      // parsed body
console.log(response.status);     // 200
console.log(response.ok);         // true
console.log(response.timing);     // 142 (ms)
console.log(response.headers.get('x-ratelimit-remaining')); // "99"
```

### Interceptors

Interceptors let you run logic before a request is sent or after a response is received. They are identical in concept to axios interceptors.

#### Request Interceptor

```ts
// Add a request ID and timestamp to every outgoing request
httix.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  if (config.headers instanceof Headers) {
    config.headers.set('X-Request-ID', crypto.randomUUID());
  } else {
    config.headers['X-Request-ID'] = crypto.randomUUID();
  }
  return config;
});
```

#### Response Interceptor

```ts
// Transform response data
httix.interceptors.response.use((response) => {
  // Wrap data in an envelope
  response.data = { success: true, data: response.data };
  return response;
});
```

#### Response Error Interceptor

```ts
// Handle 401 globally — attempt token refresh
httix.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error instanceof HttixResponseError && error.status === 401) {
      console.error('Unauthorized — redirecting to login');
      window.location.href = '/login';
    }
    // Return void to let the error propagate
    return;
  },
);
```

#### Ejecting Interceptors

```ts
const id = httix.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  if (config.headers instanceof Headers) {
    config.headers.set('X-Trace', 'enabled');
  } else {
    config.headers['X-Trace'] = 'enabled';
  }
  return config;
});

// Remove the interceptor later
httix.interceptors.request.eject(id);

// Clear all interceptors
httix.interceptors.request.clear();
```

### Retry Configuration

Automatic retry with configurable backoff strategies is built-in and enabled by default.

```ts
import { createHttix } from 'httix-http';

const client = createHttix({
  baseURL: 'https://api.example.com',
  retry: {
    attempts: 5,                          // Max retry attempts (default: 3)
    backoff: 'exponential',               // 'fixed' | 'linear' | 'exponential'
    baseDelay: 1000,                      // Base delay in ms (default: 1000)
    maxDelay: 30000,                      // Max delay cap in ms (default: 30000)
    jitter: true,                         // Add randomness to prevent thundering herd (default: true)
    retryOn: [408, 429, 500, 502, 503, 504], // Status codes to retry (default)
    retryOnNetworkError: true,            // Retry on DNS/network failures (default: true)
    retryOnSafeMethodsOnly: false,        // Only retry GET/HEAD/OPTIONS (default: false)
    retryCondition: (error) => {          // Custom retry condition
      // Don't retry if the response contains a specific error code
      if (error instanceof HttixResponseError && error.data?.code === 'NO_RETRY') {
        return false;
      }
      return true;
    },
    onRetry: (attempt, error, delay) => { // Callback before each retry
      console.warn(`Retry attempt ${attempt} after ${delay}ms — ${error.message}`);
    },
  },
});
```

Disable retry for a single request:

```ts
const { data } = await httix.get('/ephemeral', { retry: false });
```

### Timeout & Abort

#### Timeout

Every request has a default 30-second timeout. Override per-request or globally:

```ts
// Per-request timeout
const { data } = await httix.get('/slow-endpoint', { timeout: 5000 });

// Global timeout
const client = createHttix({ timeout: 10000 });
```

#### Abort with AbortController

Cancel individual requests using a standard `AbortController`:

```ts
const controller = new AbortController();

// Cancel after 2 seconds
setTimeout(() => controller.abort(), 2000);

try {
  const { data } = await httix.get('/large-dataset', {
    signal: controller.signal,
  });
} catch (error) {
  if (httix.isCancel(error)) {
    console.log('Request was cancelled by the user');
  }
}
```

#### Cancel all in-flight requests

```ts
// Cancel every pending request on this client
httix.cancelAll('User navigated away');

// Check if an error is from cancellation
try {
  await httix.get('/data');
} catch (error) {
  if (httix.isCancel(error)) {
    console.log(error.reason); // "User navigated away"
  }
}
```

### Streaming

#### Server-Sent Events (SSE)

Stream SSE events as an async iterable:

```ts
import httix from 'httix-http';

for await (const event of httix.stream.sse('https://api.example.com/events', {
  headers: { 'Accept': 'text/event-stream' },
})) {
  console.log(`[Event: ${event.type}]`, event.data);

  if (event.id) {
    console.log(`Last event ID: ${event.id}`);
  }

  if (event.type === 'shutdown') break;
}
```

#### NDJSON Streaming

Stream newline-delimited JSON objects:

```ts
import httix from 'httix-http';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

for await (const entry of httix.stream.ndjson<LogEntry>('/logs/stream')) {
  console.log(`[${entry.level}] ${entry.message}`);
}
```

### Request Deduplication

Automatically deduplicate identical in-flight requests. When enabled, if multiple calls are made with the same config before the first resolves, they share the same promise.

```ts
import { createHttix } from 'httix-http';

const client = createHttix({
  baseURL: 'https://api.example.com',
  dedup: true,
});

// Both calls will share the same underlying request
const [users1, users2] = await Promise.all([
  client.get('/users'),
  client.get('/users'),
]);

// Advanced configuration
const client2 = createHttix({
  dedup: {
    enabled: true,
    ttl: 60000, // Cache dedup result for 60s
    generateKey: (config) => `${config.method}:${config.url}`,
  },
});
```

### Rate Limiting

Client-side rate limiting to avoid overwhelming APIs:

```ts
import { createHttix } from 'httix-http';

const client = createHttix({
  baseURL: 'https://rate-limited-api.example.com',
  rateLimit: {
    maxRequests: 10,   // Max 10 requests
    interval: 1000,    // Per 1 second window
  },
});

// Requests will be automatically throttled
const results = await Promise.all([
  client.get('/resource/1'),
  client.get('/resource/2'),
  client.get('/resource/3'),
  // ... up to 10 concurrent, rest queued
]);
```

### Middleware

Middleware functions have access to both the request and response, and can modify either:

```ts
import httix, { type MiddlewareFn, type MiddlewareContext } from 'httix-http';

// Timing middleware
const timingMiddleware: MiddlewareFn = async (ctx, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.log(`[Timing] ${ctx.request.method} ${ctx.request.url} — ${duration}ms`);
};

// Request/response logging middleware
const loggingMiddleware: MiddlewareFn = async (ctx, next) => {
  console.log(`>> ${ctx.request.method} ${ctx.request.url}`);
  await next();
  if (ctx.response) {
    console.log(`<< ${ctx.response.status} ${ctx.response.statusText}`);
  }
};

// Register middleware
httix.use(timingMiddleware);
httix.use(loggingMiddleware);

// Middleware is also configurable at client creation
const client = httix.create({
  middleware: [timingMiddleware, loggingMiddleware],
});
```

### Auth

#### Bearer Auth

```ts
import { createHttix } from 'httix-http';

// Static token
const client = createHttix({
  baseURL: 'https://api.example.com',
  auth: { type: 'bearer', token: 'my-jwt-token' },
});

// Dynamic token (e.g., from a store)
const client2 = createHttix({
  baseURL: 'https://api.example.com',
  auth: {
    type: 'bearer',
    token: () => localStorage.getItem('access_token') ?? '',
    refreshToken: async () => {
      const res = await fetch('/auth/refresh', { method: 'POST' });
      const { accessToken } = await res.json();
      localStorage.setItem('access_token', accessToken);
      return accessToken;
    },
    onTokenRefresh: (token) => {
      localStorage.setItem('access_token', token);
    },
  },
});
```

#### Basic Auth

```ts
const client = createHttix({
  baseURL: 'https://api.example.com',
  auth: {
    type: 'basic',
    username: 'admin',
    password: 'secret',
  },
});
```

#### API Key Auth

```ts
// API key in header
const client = createHttix({
  baseURL: 'https://api.example.com',
  auth: {
    type: 'apiKey',
    key: 'X-API-Key',
    value: 'my-api-key',
    in: 'header',
  },
});

// API key in query string
const client2 = createHttix({
  baseURL: 'https://api.example.com',
  auth: {
    type: 'apiKey',
    key: 'api_key',
    value: 'my-api-key',
    in: 'query',
  },
});
```

### Pagination

Automatically fetch all pages of a paginated resource:

```ts
import { createHttix } from 'httix-http';

const client = createHttix({ baseURL: 'https://api.example.com' });
```

#### Offset-based pagination

```ts
for await (const page of client.paginate<User>('/users', {
  pagination: {
    style: 'offset',
    pageSize: 50,
    offsetParam: 'offset',
    limitParam: 'limit',
    maxPages: 20, // safety limit
  },
})) {
  console.log(`Fetched ${page.length} users`);
  // process page...
}
```

#### Cursor-based pagination

```ts
interface CursorResponse {
  items: User[];
  next_cursor: string | null;
}

for await (const page of client.paginate<CursorResponse>('/users', {
  pagination: {
    style: 'cursor',
    pageSize: 100,
    cursorParam: 'cursor',
    cursorExtractor: (data) => data.next_cursor,
    dataExtractor: (data) => data.items,
    stopCondition: (data) => data.next_cursor === null,
  },
})) {
  console.log(`Batch: ${page.length} users`);
}
```

#### Link header pagination (GitHub-style)

```ts
for await (const page of client.paginate<Repo[]>('/repos', {
  pagination: {
    style: 'link',
  },
})) {
  console.log(`Fetched ${page.length} repos`);
}
```

### Query & Path Parameters

#### Query Parameters

```ts
// Simple query object
const { data } = await httix.get('/search', {
  query: {
    q: 'typescript',
    page: 1,
    limit: 20,
    sort: 'stars',
    order: 'desc',
  },
});
// => GET /search?q=typescript&page=1&limit=20&sort=stars&order=desc

// Array values
const { data: filtered } = await httix.get('/items', {
  query: {
    tags: ['javascript', 'http', 'fetch'],
  },
});
// => GET /items?tags=javascript&tags=http&tags=fetch

// Null/undefined values are automatically filtered
const { data: clean } = await httix.get('/items', {
  query: {
    q: 'search',
    page: null,    // omitted
    debug: undefined, // omitted
  },
});
// => GET /items?q=search
```

#### Path Parameters

Use `:paramName` syntax in the URL and provide values via the `params` option:

```ts
const { data } = await httix.get('/users/:userId/posts/:postId', {
  params: { userId: '42', postId: '100' },
});
// => GET /users/42/posts/100

// Numbers are automatically converted to strings
const { data: repo } = await httix.get('/repos/:owner/:repo', {
  params: { owner: 'Avinashvelu03', repo: 'httix' },
});
// => GET /repos/Avinashvelu03/httix
```

### Plugins

Plugins extend httix by registering interceptors and lifecycle hooks. Import them from `httix/plugins`.

```ts
import { loggerPlugin, cachePlugin, mockPlugin } from 'httix-http/plugins';
import { createHttix } from 'httix-http';

const client = createHttix({ baseURL: 'https://api.example.com' });

// Install a plugin
const logger = loggerPlugin({ level: 'debug' });
// The plugin's install() is called, which registers interceptors
```

#### Cache Plugin

LRU response cache with configurable TTL, stale-while-revalidate, and size limits:

```ts
import { cachePlugin } from 'httix-http/plugins';
import { createHttix } from 'httix-http';

const client = createHttix({ baseURL: 'https://api.example.com' });

const cache = cachePlugin({
  maxSize: 200,                    // Max 200 entries (default: 100)
  ttl: 5 * 60 * 1000,             // 5 minute TTL (default: 300000)
  staleWhileRevalidate: true,      // Serve stale data while revalidating
  swrWindow: 60 * 1000,           // 1 minute SWR window (default: 60000)
  methods: ['GET'],               // Only cache GET requests
  respectCacheControl: true,      // Respect server Cache-Control headers
});

// Manually manage the cache
cache.invalidate('/users');             // Invalidate a specific key
cache.invalidatePattern(/^\/users\//);  // Invalidate by regex pattern
cache.clear();                           // Clear entire cache
console.log(cache.getStats());          // { size: 12, maxSize: 200, ttl: 300000 }
```

#### Logger Plugin

Structured logging of request/response lifecycle events:

```ts
import { loggerPlugin } from 'httix-http/plugins';
import { createHttix } from 'httix-http';

const client = createHttix({ baseURL: 'https://api.example.com' });

loggerPlugin({
  level: 'debug',                // 'debug' | 'info' | 'warn' | 'error' | 'none'
  logRequestBody: true,          // Log request body (default: false)
  logResponseBody: true,         // Log response body (default: false)
  logRequestHeaders: true,       // Log request headers (default: false)
  logResponseHeaders: true,      // Log response headers (default: false)
  logger: {                      // Custom logger (default: console)
    debug: (...args) => myLogger.debug(args),
    info: (...args) => myLogger.info(args),
    warn: (...args) => myLogger.warn(args),
    error: (...args) => myLogger.error(args),
  },
});
```

#### Mock Plugin

Replace `fetch` with an in-memory mock adapter — perfect for unit tests:

```ts
import { mockPlugin } from 'httix-http/plugins';
import { createHttix } from 'httix-http';

const mock = mockPlugin();
const client = createHttix({ baseURL: 'https://api.example.com' });

// Register mock handlers (fluent API)
mock
  .onGet('/users')
  .reply(200, [
    { id: 1, name: 'Jane' },
    { id: 2, name: 'John' },
  ])
  .onGet(/\/users\/\d+/)
  .reply(200, { id: 1, name: 'Jane' })
  .onPost('/users')
  .reply(201, { id: 3, name: 'Created' })
  .onDelete(/\/users\/\d+/)
  .reply(204, null);

// Use the client normally — requests hit the mock
const { data } = await client.get('/users');
console.log(data); // [{ id: 1, name: 'Jane' }, { id: 2, name: 'John' }]

// Inspect request history
const history = mock.getHistory();
console.log(history.get.length); // 1
console.log(history.get[0].method); // "GET"
console.log(history.get[0].url);    // "https://api.example.com/users"

// Reset handlers and history (adapter stays active)
mock.adapter.reset();

// Fully deactivate and restore the original fetch
mock.restore();
```

**With a test framework (e.g., Vitest):**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mockPlugin } from 'httix-http/plugins';
import { createHttix } from 'httix-http';

describe('Users API', () => {
  const mock = mockPlugin();
  const client = createHttix({ baseURL: 'https://api.example.com' });

  afterEach(() => {
    mock.restore();
  });

  it('fetches all users', async () => {
    mock.onGet('/users').reply(200, [{ id: 1, name: 'Jane' }]);

    const { data, status } = await client.get('/users');

    expect(status).toBe(200);
    expect(data).toEqual([{ id: 1, name: 'Jane' }]);
  });

  it('creates a user', async () => {
    mock.onPost('/users').reply(201, { id: 2, name: 'John' });

    const { data, status } = await client.post('/users', { name: 'John' });

    expect(status).toBe(201);
    expect(data.name).toBe('John');

    const history = mock.getHistory();
    expect(history.post).toHaveLength(1);
    expect(history.post[0].body).toEqual({ name: 'John' });
  });
});
```

### Error Handling

httix provides a structured error hierarchy. All errors extend `HttixError`.

| Error Class | When it's thrown | Key properties |
|---|---|---|
| `HttixError` | Base for all httix errors | `config`, `cause` |
| `HttixRequestError` | Network failure (DNS, CORS, etc.) | `message` |
| `HttixResponseError` | Server returns 4xx or 5xx | `status`, `statusText`, `data`, `headers` |
| `HttixTimeoutError` | Request exceeds timeout | `timeout` |
| `HttixAbortError` | Request is cancelled | `reason` |
| `HttixRetryError` | All retry attempts exhausted | `attempts`, `lastError` |

```ts
import {
  HttixError,
  HttixRequestError,
  HttixResponseError,
  HttixTimeoutError,
  HttixAbortError,
  HttixRetryError,
} from 'httix-http';

try {
  await httix.get('/unstable-endpoint');
} catch (error) {
  if (error instanceof HttixResponseError) {
    // 4xx or 5xx — the response body is available
    console.error(`${error.status} ${error.statusText}:`, error.data);

    if (error.status === 429) {
      console.error('Rate limited — slow down!');
      const retryAfter = error.headers?.get('retry-after');
      console.log(`Retry after: ${retryAfter}s`);
    }

    if (error.status >= 500) {
      console.error('Server error — this is not your fault');
    }
  } else if (error instanceof HttixTimeoutError) {
    console.error(`Timed out after ${error.timeout}ms`);
  } else if (error instanceof HttixRetryError) {
    console.error(`Failed after ${error.attempts} attempts`);
    console.error('Last error:', error.lastError.message);
  } else if (error instanceof HttixRequestError) {
    console.error('Network error:', error.message);
    console.error('Original cause:', error.cause?.message);
  } else if (error instanceof HttixAbortError) {
    console.error('Cancelled:', error.reason);
  } else if (error instanceof HttixError) {
    // Catch-all for any other httix error
    console.error('Httix error:', error.message);
    console.error('Request config:', error.config?.url);
  }
}
```

#### Disabling throw on non-2xx

If you prefer to handle status codes yourself instead of relying on exceptions:

```ts
const response = await httix.get('/users/999', { throwOnError: false });

if (response.ok) {
  console.log(response.data);
} else {
  console.error(`Error: ${response.status} — ${response.statusText}`);
  console.error(response.data); // still accessible
}
```

### TypeScript Usage

httix is written in TypeScript and provides first-class type support.

#### Generic response typing

```ts
interface User {
  id: number;
  name: string;
  email: string;
}

// Type the response data
const { data } = await httix.get<User[]>('/users');
// data is User[]

const { data: user } = await httix.post<User>('/users', { name: 'Jane' });
// user is User
```

#### Typing request config

```ts
import type { HttixRequestConfig, HttixResponse, RetryConfig } from 'httix-http';

const config: HttixRequestConfig = {
  url: '/users',
  method: 'GET',
  query: { page: 1 },
  timeout: 10000,
  retry: {
    attempts: 3,
    backoff: 'exponential',
  } satisfies RetryConfig,
};
```

#### Typing middleware

```ts
import type { MiddlewareFn, MiddlewareContext, HttixResponse } from 'httix-http';

const myMiddleware: MiddlewareFn<User, HttixRequestConfig, HttixResponse<User>> = async (
  ctx: MiddlewareContext<HttixRequestConfig, HttixResponse<User>>,
  next,
) => {
  // ctx.request is typed as HttixRequestConfig
  // ctx.response is typed as HttixResponse<User> | undefined
  await next();
  if (ctx.response) {
    ctx.response.data; // User
  }
};
```

#### Typing plugins

```ts
import type { HttixPlugin } from 'httix-http';

const myPlugin: HttixPlugin = {
  name: 'my-plugin',
  install(client) {
    client.interceptors.request.use((config) => config);
  },
  cleanup() {
    // cleanup logic
  },
};
```

---

## Migration from axios

Migrating from axios to httix is straightforward. Here are the key differences:

### Import changes

```ts
// axios
import axios from 'axios';
const { data } = await axios.get('/users');

// httix
import httix from 'httix-http';
const { data } = await httix.get('/users');
```

### Instance creation

```ts
// axios
const api = axios.create({
  baseURL: 'https://api.example.com',
  timeout: 10000,
});

// httix
const api = createHttix({
  baseURL: 'https://api.example.com',
  timeout: 10000,
});
```

### POST requests

```ts
// axios — body is the second argument
const { data } = await axios.post('/users', { name: 'Jane' });

// httix — same API
const { data } = await httix.post('/users', { name: 'Jane' });
```

### Interceptors

```ts
// axios
axios.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// httix — same pattern
httix.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  if (config.headers instanceof Headers) {
    config.headers.set('Authorization', `Bearer ${token}`);
  } else {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});
```

### Error handling

```ts
// axios
try {
  await axios.get('/users');
} catch (error) {
  if (axios.isAxiosError(error)) {
    console.log(error.response?.status);
    console.log(error.response?.data);
  }
}

// httix
try {
  await httix.get('/users');
} catch (error) {
  if (error instanceof HttixResponseError) {
    console.log(error.status);
    console.log(error.data);
  }
}
```

### Key API differences

| Feature | axios | httix |
|---|---|---|
| Cancel token | `new axios.CancelToken()` | `AbortController` |
| Response data | `response.data` | `response.data` ✅ (same) |
| Response status | `response.status` | `response.status` ✅ (same) |
| Request timeout | `timeout: 5000` | `timeout: 5000` ✅ (same) |
| Config merge | shallow merge | **deep merge** |
| `params` (query) | `params: { a: 1 }` | `query: { a: 1 }` |
| Path params | manual | `params: { id: 1 }` with `:id` in URL |
| Auto retry | needs plugin | **built-in** |
| Dedup | not available | **built-in** |
| Rate limiting | not available | **built-in** |
| Middleware | not available | **built-in** |

---

## Benchmarks

Performance measured on Node.js 22 (V8) against a local test server, averaged over 10,000 iterations.

| Operation | httix | axios | ky | node-fetch |
|---|---|---|---|---|
| Simple GET (cold) | **0.08 ms** | 0.42 ms | 0.12 ms | 0.09 ms |
| Simple GET (warm) | **0.04 ms** | 0.38 ms | 0.08 ms | 0.06 ms |
| POST with JSON | **0.09 ms** | 0.45 ms | 0.14 ms | 0.11 ms |
| With retry (3x) | **0.15 ms** | — | 0.19 ms | — |
| With interceptors | **0.06 ms** | 0.52 ms | — | — |
| Dedup hit | **0.01 ms** | — | — | — |
| Bundle size (min) | **5.1 kB** | 27.8 kB | 8.9 kB | 12.4 kB |
| Bundle size (gzip) | **2.3 kB** | 13.1 kB | 4.2 kB | 5.7 kB |

> **Note:** Benchmarks are synthetic and measure the client-side overhead (request construction, config merging, interceptor execution). Actual network latency dominates real-world timings. Run `npm run benchmark` to reproduce on your machine.

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on setting up the development environment, coding standards, and the PR process.

---

## License

[MIT](./LICENSE) &copy; 2025 Avinashvelu03
