/**
 * httix — Logger plugin
 *
 * Logs request and response lifecycle events via configurable log levels.
 */

import type { HttixClient, HttixPlugin, HttixResponse } from '../core/types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

export interface LoggerPluginConfig {
  /** Minimum log level (default: 'info') */
  level?: LogLevel;
  /** Custom logger function (default: console) */
  logger?: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  /** Whether to log request body (default: false) */
  logRequestBody?: boolean;
  /** Whether to log response body (default: false) */
  logResponseBody?: boolean;
  /** Whether to log request headers (default: false) */
  logRequestHeaders?: boolean;
  /** Whether to log response headers (default: false) */
  logResponseHeaders?: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

export function loggerPlugin(config?: LoggerPluginConfig): HttixPlugin {
  const level = config?.level ?? 'info';
  const logger = config?.logger ?? {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  const logBody = config?.logRequestBody ?? false;
  const logResponseBody = config?.logResponseBody ?? false;
  const logReqHeaders = config?.logRequestHeaders ?? false;
  const logResHeaders = config?.logResponseHeaders ?? false;

  function shouldLog(messageLevel: LogLevel): boolean {
    return LOG_LEVELS[messageLevel] >= LOG_LEVELS[level];
  }

  return {
    name: 'logger',

    install(client: HttixClient) {
      // Request interceptor — log outgoing request
      client.interceptors.request.use((reqConfig) => {
        if (shouldLog('info')) {
          const logObj: Record<string, unknown> = {
            method: reqConfig.method,
            url: reqConfig.url,
            requestId: reqConfig.requestId,
          };
          if (logReqHeaders && reqConfig.headers) {
            const h =
              reqConfig.headers instanceof Headers
                ? Object.fromEntries(reqConfig.headers.entries())
                : reqConfig.headers;
            logObj.headers = h;
          }
          if (logBody && reqConfig.body) {
            logObj.body = reqConfig.body;
          }
          logger.info('[httix] Request:', logObj);
        }
        return reqConfig;
      });

      // Response interceptor — log incoming response
      client.interceptors.response.use(
        (response: HttixResponse<unknown>): HttixResponse<unknown> => {
          if (shouldLog('info')) {
            const logObj: Record<string, unknown> = {
              status: response.status,
              statusText: response.statusText,
              timing: response.timing,
              requestId: response.config.requestId,
            };
            if (logResHeaders) {
              logObj.headers = Object.fromEntries(response.headers.entries());
            }
            if (logResponseBody) {
              logObj.data = response.data;
            }
            logger.info('[httix] Response:', logObj);
          }
          return response;
        },
        (error) => {
          if (shouldLog('error')) {
            logger.error('[httix] Error:', {
              message: error.message,
              name: error.name,
              requestId: error.config?.requestId,
            });
          }
          // Return void so the error continues to propagate
          return;
        },
      );
    },

    cleanup() {
      // Interceptors persist on the client; no additional cleanup needed.
    },
  };
}
