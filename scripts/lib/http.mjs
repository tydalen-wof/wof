// One request per source per run. No retries, no loops. A descriptive, generic user agent.
export const USER_AGENT = 'wof-fixtures-bot/1.0 (weekly football fixtures report; one request per source)';

export async function getText(url, { headers = {}, timeoutMs = 30000 } = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: '*/*', ...headers },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.text();
}

export async function getJson(url, opts) {
  const text = await getText(url, { ...opts, headers: { accept: 'application/json', ...(opts?.headers || {}) } });
  try { return JSON.parse(text); } catch { throw new Error(`Response from ${new URL(url).host} was not JSON`); }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
