const crypto = require("crypto");

// Authenticated write proxy for Supabase. The browser never holds a key that
// can write; all writes are funneled through here after session verification.
// The service role key bypasses RLS, so this function is deliberately narrow:
// two tables, three operations, one filter column each.

const ALLOWED = {
  photos: { filterKey: "id" },
  albums: { filterKey: "name" }
};
const FETCH_TIMEOUT_MS = 15000;
const READ_PAGE_SIZE = 1000;

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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

// Best-effort removal of the stored image when its photo row is deleted, so
// deleted photos don't pile up in ImageKit. Never blocks the row delete.
async function deleteImageKitFile(filePath) {
  const key = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!key || !filePath) return;
  const auth = "Basic " + Buffer.from(`${key}:`).toString("base64");
  const name = filePath.split("/").pop();
  const search = await fetchWithTimeout(
    `https://api.imagekit.io/v1/files?searchQuery=${encodeURIComponent(`name="${name}"`)}`,
    { headers: { Authorization: auth } }
  );
  if (!search.ok) return;
  const files = await search.json();
  const match = Array.isArray(files) ? files.find(f => f.filePath === filePath) : null;
  if (!match) return;
  await fetchWithTimeout(`https://api.imagekit.io/v1/files/${match.fileId}`, {
    method: "DELETE",
    headers: { Authorization: auth }
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const sessionSecret = process.env.SESSION_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missingEnv = [
    ["SESSION_SECRET", sessionSecret],
    ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", serviceKey]
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missingEnv.length) {
    console.error(`db-write missing environment variables: ${missingEnv.join(", ")}`);
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

  // Owner-only full read. The anon key can no longer see private columns
  // (coordinates), so owner mode fetches complete rows through this path.
  if (op === "select") {
    const order = table === "photos" ? "order_timestamp.desc" : "sort_order.asc,name.asc";
    const rows = [];
    let start = 0;
    while (true) {
      const end = start + READ_PAGE_SIZE - 1;
      const readRes = await fetchWithTimeout(`${url}?select=*&order=${order}`, {
        headers: { ...headers, "Range": `${start}-${end}` }
      });
      const readText = await readRes.text();
      if (!readRes.ok) {
        return { statusCode: readRes.status, body: readText || "Database error" };
      }

      let page;
      try {
        page = JSON.parse(readText || "[]");
      } catch {
        return { statusCode: 502, body: "Invalid database response" };
      }
      if (!Array.isArray(page)) return { statusCode: 502, body: "Invalid database response" };
      rows.push(...page);
      if (page.length < READ_PAGE_SIZE) break;
      start += page.length;
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify(rows)
    };
  }

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
  }

  let pendingImagePath = "";

  if (op === "delete") {
    if (typeof filterValue !== "string" || !filterValue) return { statusCode: 400, body: "Missing filter" };
    if (table === "photos") {
      // Look up the stored file path before the row disappears.
      try {
        const lookup = await fetchWithTimeout(
          `${supabaseUrl}/rest/v1/photos?id=eq.${encodeURIComponent(filterValue)}&select=cloudinary_id`,
          { headers }
        );
        if (lookup.ok) {
          const rows = await lookup.json();
          pendingImagePath = rows[0]?.cloudinary_id || "";
        }
      } catch {
        /* cleanup is best-effort */
      }
    }
    url += `?${tableCfg.filterKey}=eq.${encodeURIComponent(filterValue)}`;
    init = { method: "DELETE", headers };
  } else if (!init) {
    return { statusCode: 400, body: "Unknown op" };
  }

  const res = await fetchWithTimeout(url, init);
  const text = await res.text();
  if (!res.ok) {
    return { statusCode: res.status, body: text || "Database error" };
  }

  if (pendingImagePath) {
    try {
      await deleteImageKitFile(pendingImagePath);
    } catch (err) {
      console.error("ImageKit cleanup failed", err);
    }
  }

  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: text || "{}" };
};
