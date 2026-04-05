import { describe, it, expect } from 'vitest';
import { createCancelToken, isCancel, createCancelError } from '../../src/features/abort';
import { HttixAbortError } from '../../src/core/errors';

describe('createCancelToken', () => {
  it('should return a token and cancel function', () => {
    const { token, cancel } = createCancelToken();
    expect(token).toBeDefined();
    expect(token.signal).toBeDefined();
    expect(token.promise).toBeDefined();
    expect(typeof cancel).toBe('function');
  });

  it('should have signal not aborted initially', () => {
    const { token } = createCancelToken();
    expect(token.signal.aborted).toBe(false);
  });

  it('should abort signal when cancel is called', () => {
    const { token, cancel } = createCancelToken();
    token.promise.catch(() => {}); // prevent unhandled rejection
    cancel('user cancelled');
    expect(token.signal.aborted).toBe(true);
  });

  it('should reject promise when cancel is called', async () => {
    const { token, cancel } = createCancelToken();
    token.promise.catch(() => {}); // prevent unhandled rejection
    cancel('test reason');

    await expect(token.promise).rejects.toThrow(HttixAbortError);
  });

  it('should set abort reason to HttixAbortError with default reason', () => {
    const { token, cancel } = createCancelToken();
    token.promise.catch(() => {}); // prevent unhandled rejection
    cancel();
    expect(token.signal.reason).toBeInstanceOf(HttixAbortError);
    expect((token.signal.reason as HttixAbortError).reason).toBe('Request was aborted');
  });

  it('should set abort reason to HttixAbortError with custom reason', () => {
    const { token, cancel } = createCancelToken();
    token.promise.catch(() => {}); // prevent unhandled rejection
    cancel('timeout exceeded');
    expect(token.signal.reason).toBeInstanceOf(HttixAbortError);
    expect((token.signal.reason as HttixAbortError).reason).toBe('timeout exceeded');
  });

  it('should default reason to "Request was aborted" when no reason given', () => {
    const { token, cancel } = createCancelToken();
    token.promise.catch(() => {}); // prevent unhandled rejection
    cancel();
    expect((token.signal.reason as HttixAbortError).message).toBe('Request was aborted');
  });
});

describe('isCancel', () => {
  it('should return true for HttixAbortError', () => {
    expect(isCancel(new HttixAbortError('cancelled'))).toBe(true);
  });

  it('should return true for error from cancel token', () => {
    const { token, cancel } = createCancelToken();
    token.promise.catch(() => {}); // prevent unhandled rejection
    cancel('test');
    expect(isCancel(token.signal.reason)).toBe(true);
  });

  it('should return false for regular Error', () => {
    expect(isCancel(new Error('not cancelled'))).toBe(false);
  });

  it('should return false for null', () => {
    expect(isCancel(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isCancel(undefined)).toBe(false);
  });

  it('should return false for string', () => {
    expect(isCancel('AbortError')).toBe(false);
  });
});

describe('createCancelError', () => {
  it('should create HttixAbortError with reason', () => {
    const error = createCancelError('test reason');
    expect(error).toBeInstanceOf(HttixAbortError);
    expect(error.reason).toBe('test reason');
  });

  it('should create HttixAbortError with config', () => {
    const config = { url: '/test' };
    const error = createCancelError('reason', config);
    expect(error.config).toBe(config);
  });

  it('should default reason to "Request was aborted"', () => {
    const error = createCancelError();
    expect(error.reason).toBe('Request was aborted');
  });
});
