import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { adminTokenMatches, requireAdminToken } from '../auth';

describe('adminTokenMatches — constant-time, fail-closed', () => {
  it('matches when provided equals expected', () => {
    expect(adminTokenMatches('s3cr3t-token', 's3cr3t-token')).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(adminTokenMatches('wrong', 's3cr3t-token')).toBe(false);
  });

  it('rejects when provided is empty', () => {
    expect(adminTokenMatches('', 's3cr3t-token')).toBe(false);
  });

  it('fails closed when expected (env) is empty', () => {
    expect(adminTokenMatches('anything', '')).toBe(false);
  });

  it('does not throw on differing lengths (hashes before compare)', () => {
    expect(() => adminTokenMatches('short', 'a-much-longer-expected-token')).not.toThrow();
    expect(adminTokenMatches('short', 'a-much-longer-expected-token')).toBe(false);
  });
});

describe('requireAdminToken — express guard', () => {
  const ENV = process.env.ADMIN_API_TOKEN;
  afterEach(() => {
    if (ENV === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = ENV;
  });

  const mkRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };
  const mkReq = (token?: string) => ({ header: (name: string) => (name === 'x-admin-token' ? token : undefined) }) as any;

  it('calls next() with a valid token', () => {
    process.env.ADMIN_API_TOKEN = 'valid-token';
    const next = vi.fn();
    const res = mkRes();
    requireAdminToken(mkReq('valid-token'), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('401 when the token header is missing', () => {
    process.env.ADMIN_API_TOKEN = 'valid-token';
    const next = vi.fn();
    const res = mkRes();
    requireAdminToken(mkReq(undefined), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('401 with a wrong token', () => {
    process.env.ADMIN_API_TOKEN = 'valid-token';
    const next = vi.fn();
    const res = mkRes();
    requireAdminToken(mkReq('nope'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('401 (fail-closed) when ADMIN_API_TOKEN env is unset', () => {
    delete process.env.ADMIN_API_TOKEN;
    const next = vi.fn();
    const res = mkRes();
    requireAdminToken(mkReq('any-token'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
