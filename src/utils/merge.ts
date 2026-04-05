/**
 * httix — Configuration merging utilities
 */

import type { HttixRequestConfig, QueryParams } from '../core/types';
import { mergeHeaders } from './headers';

/**
 * Deep-merge two partial request configs.
 *
 * Rules:
 *  - Headers → mergeHeaders (custom overrides defaults)
 *  - Query → mergeQueryParams (source overrides target)
 *  - Primitive values (string, number, boolean) → source takes precedence
 *  - Plain objects → deep merge recursively
 *  - Arrays → source replaces target entirely
 *  - Neither input is mutated.
 */
export function deepMergeConfig(
  target: Partial<HttixRequestConfig>,
  source: Partial<HttixRequestConfig>,
): Partial<HttixRequestConfig> {
  const result: Partial<HttixRequestConfig> = { ...target };

  for (const key of Object.keys(source) as Array<keyof Partial<HttixRequestConfig>>) {
    const sourceVal = source[key];
    const targetVal = target[key];

    // Headers — use the dedicated merge function
    if (key === 'headers') {
      result.headers = mergeHeaders(
        targetVal as Partial<HttixRequestConfig>['headers'] | undefined,
        sourceVal as Partial<HttixRequestConfig>['headers'] | undefined,
      );
      continue;
    }

    // Query — merge query param objects
    if (key === 'query') {
      result.query = mergeQueryParams(
        targetVal as QueryParams | undefined,
        sourceVal as QueryParams | undefined,
      );
      continue;
    }

    // Skip undefined source values
    if (sourceVal === undefined) {
      continue;
    }

    // Arrays — source replaces target entirely
    if (Array.isArray(sourceVal)) {
      (result as Record<string, unknown>)[key as string] = sourceVal;
      continue;
    }

    // If both target and source are plain objects, deep merge
    if (
      sourceVal !== null &&
      targetVal !== null &&
      typeof sourceVal === 'object' &&
      typeof targetVal === 'object' &&
      !Array.isArray(sourceVal) &&
      !Array.isArray(targetVal)
    ) {
      (result as Record<string, unknown>)[key as string] = deepMergePlainObjects(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
      continue;
    }

    // Primitive values and everything else — source wins
    (result as Record<string, unknown>)[key as string] = sourceVal;
  }

  return result;
}

/**
 * Merge two query-params objects. Source values override target values.
 */
export function mergeQueryParams(
  target: QueryParams | undefined,
  source: QueryParams | undefined,
): QueryParams {
  if (!target && !source) {
    return {};
  }
  if (!target) {
    return { ...source! };
  }
  if (!source) {
    return { ...target };
  }
  return { ...target, ...source };
}

/**
 * Recursively deep-merge two plain objects (no special cases for headers/query).
 */
function deepMergePlainObjects(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (sourceVal === undefined) {
      continue;
    }

    // Arrays — source replaces target
    if (Array.isArray(sourceVal)) {
      result[key] = sourceVal;
      continue;
    }

    // Both plain objects — recurse
    if (
      sourceVal !== null &&
      targetVal !== null &&
      typeof sourceVal === 'object' &&
      typeof targetVal === 'object' &&
      !Array.isArray(sourceVal) &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMergePlainObjects(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
      continue;
    }

    // Primitives and everything else — source wins
    result[key] = sourceVal;
  }

  return result;
}
