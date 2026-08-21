import { readFile } from "node:fs/promises";

const DEFAULT_SITE_URL = "https://anhphotography.netlify.app/";
const REQUEST_TIMEOUT_MS = 8000;
const RETRY_DELAYS_MS = [0, 500, 1500];
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;
const MAX_IMAGE_CHECKS = 100;
const IMAGE_CHECK_CONCURRENCY = 4;

const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const siteUrl = normalizeSiteUrl(process.env.PORTFOLIO_SITE_URL || DEFAULT_SITE_URL);
const supabaseUrl = extractStringConstant("SUPABASE_URL");
const supabaseKey = extractStringConstant("SUPABASE_KEY");
const photoColumns = extractStringConstant("SB_PUBLIC_COLS");
const albumColumns = extractStringConstant("SB_ALBUMS_PUBLIC_COLS");
const imageKitId = extractStringConstant("IMAGEKIT_ID");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeSiteUrl(value) {
  const parsed = new URL(value);
  assert(parsed.protocol === "https:", "Production health checks require HTTPS");
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed;
}

function extractStringConstant(name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = appSource.match(new RegExp(`const\\s+${escapedName}\\s*=\\s*["']([^"']+)["']`))?.[1];
  assert(value, `Could not read ${name} from app.js`);
  return value;
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function request(url, options = {}) {
  const {
    label = String(url),
    expectedStatuses = [200],
    ...fetchOptions
  } = options;
  let lastFailure = "request did not run";

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    if (RETRY_DELAYS_MS[attempt]) await sleep(RETRY_DELAYS_MS[attempt]);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        redirect: "follow",
        signal: controller.signal
      });
      const body = Buffer.from(await response.arrayBuffer());
      const result = { status: response.status, headers: response.headers, body };
      if (expectedStatuses.includes(response.status)) return result;

      lastFailure = `HTTP ${response.status}`;
      if (!isRetryableStatus(response.status)) break;
    } catch (error) {
      lastFailure = error?.name === "AbortError"
        ? `timed out after ${REQUEST_TIMEOUT_MS} ms`
        : error?.message || String(error);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`${label} failed: ${lastFailure}`);
}

function requireContentType(response, prefix, label) {
  const contentType = response.headers.get("content-type") || "";
  assert(contentType.toLowerCase().startsWith(prefix), `${label} returned ${contentType || "no content type"}`);
}

async function checkProductionShell() {
  const root = await request(siteUrl, { label: "Production root" });
  requireContentType(root, "text/html", "Production root");
  const html = root.body.toString("utf8");
  assert(html.includes("<title>Anh Trinh | Photography</title>"), "Production root returned unexpected HTML");
  assert(html.includes('src="app.js"'), "Production root does not reference app.js");
  assert(html.includes('href="styles.css"'), "Production root does not reference styles.css");

  const assets = [
    { path: "app.js", contentType: "application/javascript", marker: "SB_PUBLIC_COLS" },
    { path: "styles.css", contentType: "text/css", marker: ".hero" },
    { path: "social-preview.png", contentType: "image/", marker: null }
  ];
  for (const asset of assets) {
    const response = await request(new URL(asset.path, siteUrl), { label: `Production ${asset.path}` });
    requireContentType(response, asset.contentType, `Production ${asset.path}`);
    assert(response.body.length > 0, `Production ${asset.path} is empty`);
    if (asset.marker) {
      assert(response.body.toString("utf8").includes(asset.marker), `Production ${asset.path} is missing ${asset.marker}`);
    }
  }

  console.log(`Production root and ${assets.length} static assets are healthy.`);
}

async function readPublicTable(table, columns, order) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const start = page * PAGE_SIZE;
    const endpoint = new URL(`/rest/v1/${table}`, supabaseUrl);
    endpoint.searchParams.set("select", columns);
    endpoint.searchParams.set("order", order);
    const response = await request(endpoint, {
      label: `Public Supabase ${table} read`,
      expectedStatuses: [200, 206],
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Range: `${start}-${start + PAGE_SIZE - 1}`,
        "Range-Unit": "items"
      }
    });

    let pageRows;
    try {
      pageRows = JSON.parse(response.body.toString("utf8"));
    } catch {
      throw new Error(`Public Supabase ${table} read returned invalid JSON`);
    }
    assert(Array.isArray(pageRows), `Public Supabase ${table} read did not return an array`);
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) return rows;
  }

  throw new Error(`Public Supabase ${table} read exceeded the ${MAX_PAGES * PAGE_SIZE}-row safety limit`);
}

function assertExactColumns(rows, columns, label) {
  const expected = new Set(columns.split(","));
  for (const row of rows) {
    const actual = Object.keys(row);
    assert(actual.length === expected.size, `${label} returned an unexpected number of columns`);
    assert(actual.every(column => expected.has(column)), `${label} returned a column outside the public allowlist`);
  }
}

function evenlySample(values, limit) {
  if (values.length <= limit) return values;
  const sampled = [];
  for (let index = 0; index < limit; index += 1) {
    sampled.push(values[Math.round(index * (values.length - 1) / (limit - 1))]);
  }
  return [...new Set(sampled)];
}

async function mapWithConcurrency(values, concurrency, worker) {
  let nextIndex = 0;
  async function run() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
}

async function checkVisitorDataAndImages() {
  const [photos, albums] = await Promise.all([
    readPublicTable("photos", photoColumns, "order_timestamp.desc"),
    readPublicTable("albums", albumColumns, "sort_order.asc,name.asc")
  ]);
  assert(photos.length > 0, "Public Supabase photos read returned no photographs");
  assertExactColumns(photos, photoColumns, "Public photos read");
  assertExactColumns(albums, albumColumns, "Public albums read");

  const visitorPaths = [...new Set([
    ...photos.map(photo => photo.cloudinary_id),
    ...albums.map(album => album.cover_cloudinary_id)
  ].filter(path => typeof path === "string" && path.trim()))].sort();
  assert(visitorPaths.length > 0, "Public data contains no ImageKit asset paths");

  const sampledPaths = evenlySample(visitorPaths, MAX_IMAGE_CHECKS);
  await mapWithConcurrency(sampledPaths, IMAGE_CHECK_CONCURRENCY, async (filePath, index) => {
    const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
    const assetUrl = new URL(normalizedPath.replace(/^\/+/, ""), `https://ik.imagekit.io/${imageKitId}/`);
    assetUrl.searchParams.set("tr", "w-64,q-25,f-auto");
    const response = await request(assetUrl, { label: `Visitor ImageKit asset ${index + 1} (${filePath})` });
    requireContentType(response, "image/", `Visitor ImageKit asset ${index + 1}`);
    assert(response.body.length > 0, `Visitor ImageKit asset ${index + 1} is empty`);
  });

  console.log(
    `Public Supabase reads are healthy (${photos.length} photos, ${albums.length} albums); ` +
    `${sampledPaths.length} of ${visitorPaths.length} visitor ImageKit assets checked.`
  );
}

async function checkOwnerBoundary() {
  const checks = [
    request(new URL("api/verify-owner", siteUrl), {
      label: "Invalid owner login",
      expectedStatuses: [401],
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "weekly-health-check-invalid-password" })
    }),
    request(new URL("api/imagekit-auth", siteUrl), {
      label: "Unauthenticated ImageKit signature request",
      expectedStatuses: [401],
      method: "GET"
    }),
    request(new URL("api/db-write", siteUrl), {
      label: "Unauthenticated database proxy request",
      expectedStatuses: [401],
      method: "POST",
      headers: {
        Authorization: "Bearer weekly-health-check-invalid-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ table: "photos", op: "select" })
    })
  ];
  await Promise.all(checks);
  console.log("Owner endpoints reject invalid credentials with HTTP 401; no write operations were sent.");
}

await checkProductionShell();
await checkVisitorDataAndImages();
await checkOwnerBoundary();
console.log("Weekly portfolio health check passed.");
