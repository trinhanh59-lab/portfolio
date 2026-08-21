import { access, readFile } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const [html, app, netlifyConfig] = await Promise.all([
  read("index.html"),
  read("app.js"),
  read("netlify.toml")
]);

for (const path of [
  "app.js",
  "netlify/functions/db-write.js",
  "netlify/functions/imagekit-auth.js",
  "netlify/functions/verify-owner.js"
]) {
  new vm.Script(await read(path), { filename: path });
}

const htmlIdList = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const htmlIds = new Set(htmlIdList);
const duplicateIds = htmlIdList.filter((id, index) => htmlIdList.indexOf(id) !== index);
assert(duplicateIds.length === 0, `Duplicate HTML ids: ${[...new Set(duplicateIds)].join(", ")}`);

const directIdRefs = new Set(
  [...app.matchAll(/getElementById\("([^"]+)"\)/g)].map(match => match[1])
);
const missingIds = [...directIdRefs].filter(id => !htmlIds.has(id));
assert(missingIds.length === 0, `JavaScript references missing HTML ids: ${missingIds.join(", ")}`);

const localAssets = new Set(
  [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)]
    .map(match => match[1].split(/[?#]/)[0])
    .filter(path => path && !path.startsWith("/") && !/^(?:https?:|mailto:|data:)/.test(path))
);
for (const path of localAssets) {
  await access(new URL(path, root));
}

assert(app.includes('const SB_PUBLIC_COLS = "'), "Public photo column allowlist is missing");
const publicColumns = app.match(/const SB_PUBLIC_COLS = "([^"]+)"/)?.[1]?.split(",") || [];
assert(!publicColumns.includes("coordinates"), "Public photo query exposes coordinates");
assert(!publicColumns.includes("tags"), "Public photo query exposes private tags");
assert(!app.includes("SUPABASE_SERVICE_ROLE_KEY"), "Service-role variable leaked into browser code");
assert(app.includes("const IMAGEKIT_UPLOAD_TIMEOUT_MS = 60000"), "ImageKit upload timeout is missing");
assert(
  /fetchWithTimeout\(\s*IMAGEKIT_UPLOAD_URL,[\s\S]*?IMAGEKIT_UPLOAD_TIMEOUT_MS\s*\)/.test(app),
  "ImageKit upload does not use its bounded timeout"
);
assert(app.includes('typeof data?.filePath !== "string"'), "ImageKit upload accepts a missing file path");
assert(app.includes("First error: ${failureMessages[0]}"), "Upload failures lose their actionable reason");
assert(netlifyConfig.includes('from = "/api/*"'), "Netlify API redirect is missing");
assert(netlifyConfig.includes("X-Content-Type-Options"), "Baseline security headers are missing");

console.log(`Validated ${htmlIds.size} HTML ids, ${directIdRefs.size} JavaScript references, and ${localAssets.size} local assets.`);
