const crypto = require("crypto");

// Authenticated write proxy for Supabase. The browser never holds a key that
// can write; all writes are funneled through here after session verification.
// The service role key bypasses RLS, so this function is deliberately narrow:
// two tables, three operations, one filter column each.

const ALLOWED = {
  photos: { filterKey: "id" },
  albums: { filterKey: "name" }
};

function verifySessionToken(token, secret) {
  if (typeof token !== "string" || !token.includes(".")) return false;
  const [expiryStr, sig] = token.split(".");
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;

  const expected = crypto.createHmac("sha256", secret).update(String(expiry)).digest("hex");
  let sigBuf, expectedBuf;
  try {
    sigBuf = Buffer.from(sig, "hex");
    expectedBuf = Buffer.from(expected, "hex");
  } catch {
    return false;
  }
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

function bearerTokenFromHeaders(headers) {
  const auth = headers?.authorization || headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1] : null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const sessionSecret = process.env.SESSION_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sessionSecret || !supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: "Server not configured" };
  }

  if (!verifySessionToken(bearerTokenFromHeaders(event.headers), sessionSecret)) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  if ((event.body || "").length > 200000) {
    return { statusCode: 413, body: "Payload too large" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { table, op, filterValue, row } = payload;
  const tableCfg = ALLOWED[table];
  if (!tableCfg) return { statusCode: 400, body: "Unknown table" };

  const headers = {
    "Content-Type": "application/json",
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`
  };

  let url = `${supabaseUrl}/rest/v1/${table}`;
  let init;

  if (op === "upsert") {
    if (!row || typeof row !== "object") return { statusCode: 400, body: "Missing row" };
    init = {
      method: "POST",
      headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(row)
    };
  } else if (op === "patch") {
    if (!row || typeof row !== "object") return { statusCode: 400, body: "Missing row" };
    if (typeof filterValue !== "string" || !filterValue) return { statusCode: 400, body: "Missing filter" };
    url += `?${tableCfg.filterKey}=eq.${encodeURIComponent(filterValue)}`;
    init = {
      method: "PATCH",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify(row)
    };
  } else if (op === "delete") {
    if (typeof filterValue !== "string" || !filterValue) return { statusCode: 400, body: "Missing filter" };
    url += `?${tableCfg.filterKey}=eq.${encodeURIComponent(filterValue)}`;
    init = { method: "DELETE", headers };
  } else {
    return { statusCode: 400, body: "Unknown op" };
  }

  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    return { statusCode: res.status, body: text || "Database error" };
  }
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: text || "{}" };
};
