import assert from 'node:assert/strict';
import {
  CONFLUENCE_BROWSER_TIMEOUT_MS,
  CONFLUENCE_DIRECT_TIMEOUT_MS,
  CONFLUENCE_JSON_MAX_BYTES,
  getConfluenceJson,
  isCloudflareManagedChallenge,
  isSameOriginUrl,
  type ConfluenceHttpRequest,
} from './confluence-http';

const URL = 'https://insight.fsoft.com.vn/conf/rest/api/user/current';
const AUTH = 'Bearer inert-$(whoami)-token';
const VALID_EXECUTABLE = process.execPath;

async function main(): Promise<void> {
  assert.equal(isCloudflareManagedChallenge({ status: 403, headers: { 'cf-mitigated': 'challenge' } }), true);
  assert.equal(isCloudflareManagedChallenge({ status: 403, headers: { 'CF-Mitigated': 'Challenge' } }), true);
  assert.equal(isCloudflareManagedChallenge({ status: 401, headers: { 'cf-mitigated': 'challenge' } }), false);
  assert.equal(isCloudflareManagedChallenge({ status: 403, headers: {} }), false);
  assert.equal(isSameOriginUrl(URL, 'https://insight.fsoft.com.vn/conf/rest/api/content/830569842'), true);
  assert.equal(isSameOriginUrl(URL, 'https://evil.example/conf/rest/api/user/current'), false);
  assert.equal(isSameOriginUrl(URL, 'not-a-url'), false);

  let browserCalls = 0;
  const direct = await getConfluenceJson(
    URL,
    { Authorization: AUTH, Accept: 'application/json' },
    {},
    {
      directGet: async (request) => {
        assert.equal(request.headers.Authorization, AUTH, 'credential bytes must remain inert header data');
        assert.equal(request.timeoutMs, CONFLUENCE_DIRECT_TIMEOUT_MS);
        return { status: 200, headers: { 'content-type': 'application/json;charset=UTF-8' }, body: '{"ok":true}' };
      },
      browserGet: async () => { browserCalls += 1; throw new Error('must not run'); },
    },
  );
  assert.deepEqual(direct, { ok: true });
  assert.equal(browserCalls, 0, 'direct success must not launch a browser');

  let browserRequest: ConfluenceHttpRequest | undefined;
  const fallback = await getConfluenceJson(
    URL,
    { Authorization: AUTH, Accept: 'application/json' },
    { CONFLUENCE_BROWSER_EXECUTABLE: VALID_EXECUTABLE },
    {
      directGet: async () => ({
        status: 403,
        headers: { 'cf-mitigated': 'challenge', 'content-type': 'text/html' },
        body: '<html>challenge</html>',
      }),
      browserGet: async (request) => {
        browserRequest = request;
        return { status: 200, headers: { 'content-type': 'application/json' }, body: '{"page":"ok"}' };
      },
    },
  );
  assert.deepEqual(fallback, { page: 'ok' });
  assert.equal(browserRequest?.executablePath, VALID_EXECUTABLE);
  assert.equal(browserRequest?.headers.Authorization, AUTH);
  assert.equal(browserRequest?.timeoutMs, CONFLUENCE_BROWSER_TIMEOUT_MS);

  for (const response of [
    { status: 401, headers: { 'content-type': 'application/json' }, body: '{}' },
    { status: 403, headers: { 'content-type': 'application/json' }, body: '{}' },
  ]) {
    browserCalls = 0;
    await assert.rejects(
      () => getConfluenceJson(URL, {}, { CONFLUENCE_BROWSER_EXECUTABLE: VALID_EXECUTABLE }, {
        directGet: async () => response,
        browserGet: async () => { browserCalls += 1; return response; },
      }),
      /HTTP (401|403)/,
    );
    assert.equal(browserCalls, 0, 'ordinary auth/ACL failures must never invoke the browser fallback');
  }

  let missingExecutableBrowserCalls = 0;
  await assert.rejects(
    () => getConfluenceJson(URL, {}, {}, {
      directGet: async () => ({ status: 403, headers: { 'cf-mitigated': 'challenge' }, body: '' }),
      browserGet: async () => {
        missingExecutableBrowserCalls += 1;
        return { status: 200, headers: { 'content-type': 'application/json' }, body: '{}' };
      },
    }),
    /CONFLUENCE_BROWSER_EXECUTABLE/,
  );
  assert.equal(missingExecutableBrowserCalls, 0, 'missing executable must fail before browser launch');

  const browserAttacks: Array<[string, { status: number; headers: Record<string, string>; body: string }, RegExp]> = [
    ['non-JSON', { status: 200, headers: { 'content-type': 'text/html' }, body: '{}' }, /non-JSON/],
    ['non-2xx', { status: 403, headers: { 'content-type': 'application/json' }, body: '{}' }, /HTTP 403/],
    ['malformed', { status: 200, headers: { 'content-type': 'application/json' }, body: '{' }, /malformed JSON/],
    ['oversize', { status: 200, headers: { 'content-type': 'application/json' }, body: 'x'.repeat(CONFLUENCE_JSON_MAX_BYTES + 1) }, /exceeded/],
  ];
  for (const [name, response, error] of browserAttacks) {
    await assert.rejects(
      () => getConfluenceJson(URL, {}, { CONFLUENCE_BROWSER_EXECUTABLE: VALID_EXECUTABLE }, {
        directGet: async () => ({ status: 403, headers: { 'cf-mitigated': 'challenge' }, body: '' }),
        browserGet: async () => response,
      }),
      error,
      name,
    );
  }

  await assert.rejects(
    () => getConfluenceJson('http://user:pass@example.test/conf', {}, {}, {
      directGet: async () => ({ status: 200, headers: { 'content-type': 'application/json' }, body: '{}' }),
    }),
    /credential-free HTTPS/,
  );

  console.log('Canary GREEN: Confluence HTTP uses direct JSON first, falls back to an explicit isolated browser only for an exact Cloudflare challenge, and fails closed on auth, executable, format, and size attacks.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
