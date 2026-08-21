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
assert(app.includes('location: "Houston, Texas"'), "Public location is not based in Houston");
assert(app.includes('label:    "Houston, Texas"'), "Live location label is not based in Houston");
assert(app.includes("lat:      29.7604"), "Houston weather latitude is missing");
assert(app.includes("lon:      -95.3698"), "Houston weather longitude is missing");
assert(app.includes('timezone: "America/Chicago"'), "Houston timezone is missing");
assert(html.includes('id="footerSecretTrigger">© Anh Trinh · Houston, Texas · 2026'), "Footer location is not based in Houston");

assert(app.includes('window.addEventListener("popstate"'), "Back/Forward route restoration is missing");
assert(app.includes('portfolioPhotoEntry'), "Photo history entries are not distinguished from direct links");
assert(
  /function navDetail\([\s\S]*?mode: "replace"[\s\S]*?renderDetail\(next\)/.test(app),
  "Previous/Next photo navigation would add history spam"
);
assert(
  /function buildInquiryLink\([\s\S]*?buildPortfolioUrl\(\{ photo: photo\.id \}, \{ share: true \}\)/.test(app),
  "Photo inquiry email is missing its permalink"
);
assert(html.includes('id="siteNotice" role="status" aria-live="polite"'), "Public share/fallback status is missing");
assert(html.includes('id="detailShareActions"'), "Photo share controls have no render target");

const buildPortfolioUrlSource = app.match(
  /function buildPortfolioUrl\([\s\S]*?\n}\n\n(?=function commitPortfolioUrl)/
)?.[0];
assert(buildPortfolioUrlSource, "Portfolio URL builder is missing");
const routeContext = vm.createContext({
  URL,
  SITE: { siteUrl: "https://anhphotography.netlify.app" },
  window: {
    location: {
      href: "http://127.0.0.1:4173/?utm_source=check&photo=old#owner",
      origin: "http://127.0.0.1:4173",
      pathname: "/"
    }
  }
});
new vm.Script(buildPortfolioUrlSource, { filename: "app.js#buildPortfolioUrl" }).runInContext(routeContext);
const navigationUrl = String(routeContext.buildPortfolioUrl({ collection: "The Bay Area" }));
assert(navigationUrl === "http://127.0.0.1:4173/?utm_source=check&collection=The+Bay+Area", "Navigation URL does not preserve unrelated parameters cleanly");
const sharedPhotoUrl = String(routeContext.buildPortfolioUrl({ photo: "photo-123" }, { share: true }));
assert(sharedPhotoUrl === "https://anhphotography.netlify.app/?photo=photo-123", "Shared photo URL is not clean and production-stable");

const resolvePortfolioUrlStateSource = app.match(
  /function resolvePortfolioUrlState\([\s\S]*?\n}\n\n(?=function activePortfolioRoute)/
)?.[0];
assert(resolvePortfolioUrlStateSource, "Portfolio route resolver is missing");
const resolveContext = vm.createContext({
  state: {
    albumGroups: [{ name: "Japan" }, { name: "Vietnam" }],
    photos: [
      { id: "japan-photo", series: "Japan", starred: true },
      { id: "unfeatured-photo", series: "Japan", starred: false }
    ]
  },
  readPortfolioUrl: () => ({ collection: "", photo: "", view: "" })
});
new vm.Script(resolvePortfolioUrlStateSource, { filename: "app.js#resolvePortfolioUrlState" }).runInContext(resolveContext);
const staleCollection = resolveContext.resolvePortfolioUrlState({ collection: "Vietnam", photo: "japan-photo", view: "" });
assert(staleCollection.route.collection === "" && staleCollection.route.photo === "japan-photo", "A valid photo does not override stale collection context");
const missingPhoto = resolveContext.resolvePortfolioUrlState({ collection: "Japan", photo: "missing", view: "" });
assert(missingPhoto.route.collection === "Japan" && missingPhoto.invalidPhoto, "An invalid photo does not retain its valid collection fallback");
const foldedCollection = resolveContext.resolvePortfolioUrlState({ collection: "japan", photo: "", view: "" });
assert(foldedCollection.route.collection === "Japan" && foldedCollection.needsNormalization, "Collection casing is not normalized safely");
const bothMissing = resolveContext.resolvePortfolioUrlState({ collection: "missing", photo: "missing", view: "" });
assert(bothMissing.activeAlbum === "all" && !bothMissing.route.collection && !bothMissing.route.photo, "Fully invalid routes do not fall back to all work");
const staleFeatured = resolveContext.resolvePortfolioUrlState({ collection: "", photo: "unfeatured-photo", view: "featured" });
assert(staleFeatured.featuredMismatch && !staleFeatured.route.view && staleFeatured.route.photo === "unfeatured-photo", "An unfeatured photo does not escape stale Featured context");

const applyPortfolioUrlStateSource = app.match(
  /function applyPortfolioUrlState\([\s\S]*?\n}\n\n(?=function hasBlockingOverlay)/
)?.[0];
assert(applyPortfolioUrlStateSource, "Portfolio route application is missing");
let routeRenderCount = 0;
const applyContext = vm.createContext({
  portfolioRouteReady: true,
  state: { activeAlbum: "Japan", activeId: "photo-1", searchQ: "quiet" },
  resolvePortfolioUrlState: () => ({
    route: { collection: "Japan", photo: "", view: "" },
    activeAlbum: "Japan",
    activeId: null,
    invalidCollection: false,
    invalidPhoto: false,
    mismatch: false,
    needsNormalization: false
  }),
  document: { getElementById: () => ({ value: "quiet" }) },
  renderFilters: () => { routeRenderCount += 1; },
  renderProjectIntro: () => { routeRenderCount += 1; },
  renderGallery: () => { routeRenderCount += 1; },
  initScrollReveal: () => {},
  syncDetailOverlayFromState: () => {},
  updateViewMeta: () => {},
  showSiteNotice: () => {},
  commitPortfolioUrl: () => {},
  requestAnimationFrame: () => {}
});
new vm.Script(applyPortfolioUrlStateSource, { filename: "app.js#applyPortfolioUrlState" }).runInContext(applyContext);
applyContext.applyPortfolioUrlState({ source: "popstate" });
assert(applyContext.state.searchQ === "quiet" && routeRenderCount === 0, "Closing a same-view photo loses the active search or focus target");

console.log(`Validated ${htmlIds.size} HTML ids, ${directIdRefs.size} JavaScript references, and ${localAssets.size} local assets.`);
