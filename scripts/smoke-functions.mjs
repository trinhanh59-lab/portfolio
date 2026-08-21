import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const verifyOwner = require("../netlify/functions/verify-owner.js").handler;
const imageKitAuth = require("../netlify/functions/imagekit-auth.js").handler;
const dbWrite = require("../netlify/functions/db-write.js").handler;

const testEnv = {
  OWNER_PASSWORD: "test-owner-password",
  SESSION_SECRET: "test-session-secret-with-enough-entropy",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  IMAGEKIT_PRIVATE_KEY: "test-imagekit-private-key",
  IMAGEKIT_PUBLIC_KEY: "test-imagekit-public-key"
};
const previousEnv = Object.fromEntries(
  Object.keys(testEnv).map(key => [key, process.env[key]])
);
const originalFetch = globalThis.fetch;

try {
  Object.assign(process.env, testEnv);

  const malformedLogin = await verifyOwner({ httpMethod: "POST", body: "{" });
  assert.equal(malformedLogin.statusCode, 400);

  const login = await verifyOwner({
    httpMethod: "POST",
    body: JSON.stringify({ password: testEnv.OWNER_PASSWORD })
  });
  assert.equal(login.statusCode, 200);
  assert.equal(login.headers["Cache-Control"], "no-store");
  const { token } = JSON.parse(login.body);
  assert.match(token, /^\d+\.[a-f0-9]{64}$/);

  const imageAuth = await imageKitAuth({
    httpMethod: "GET",
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(imageAuth.statusCode, 200);
  assert.equal(JSON.parse(imageAuth.body).publicKey, testEnv.IMAGEKIT_PUBLIC_KEY);

  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error("Unauthorized requests must not reach an upstream service");
  };
  const unauthorized = await dbWrite({
    httpMethod: "POST",
    headers: { authorization: "Bearer invalid" },
    body: JSON.stringify({ table: "photos", op: "select" })
  });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(fetchCount, 0);

  const ranges = [];
  globalThis.fetch = async (_url, init) => {
    ranges.push(init.headers.Range);
    const start = Number(init.headers.Range.split("-")[0]);
    const count = start === 0 ? 1000 : 1;
    const rows = Array.from({ length: count }, (_, index) => ({ id: String(start + index) }));
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const selected = await dbWrite({
    httpMethod: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ table: "photos", op: "select" })
  });
  assert.equal(selected.statusCode, 200);
  assert.equal(selected.headers["Cache-Control"], "no-store");
  assert.equal(JSON.parse(selected.body).length, 1001);
  assert.deepEqual(ranges, ["0-999", "1000-1999"]);

  let modernHeaders;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test-server-key";
  globalThis.fetch = async (_url, init) => {
    modernHeaders = init.headers;
    return new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const modernSelected = await dbWrite({
    httpMethod: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ table: "photos", op: "select" })
  });
  assert.equal(modernSelected.statusCode, 200);
  assert.equal(modernHeaders.apikey, "sb_secret_test-server-key");
  assert.ok(!Object.hasOwn(modernHeaders, "Authorization"));
  process.env.SUPABASE_SERVICE_ROLE_KEY = testEnv.SUPABASE_SERVICE_ROLE_KEY;

  let writeRequest;
  globalThis.fetch = async (url, init) => {
    writeRequest = { url, init };
    return new Response("", { status: 201 });
  };
  const written = await dbWrite({
    httpMethod: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      table: "photos",
      op: "upsert",
      row: { id: "photo-1", title: "Smoke test" }
    })
  });
  assert.equal(written.statusCode, 200);
  assert.equal(writeRequest.init.method, "POST");
  assert.equal(writeRequest.init.headers.Prefer, "resolution=merge-duplicates");
  assert.ok(!Object.hasOwn(JSON.parse(writeRequest.init.body), "coordinates"));

  const deleteCalls = [];
  globalThis.fetch = async (url, init) => {
    deleteCalls.push({ url: String(url), init });
    if (String(url).startsWith(`${testEnv.SUPABASE_URL}/rest/v1/photos`)) {
      return new Response(JSON.stringify([{ cloudinary_id: "/portfolio/photo-delete.jpg" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (String(url).includes("/v1/files?")) {
      return new Response(JSON.stringify([{
        fileId: "imagekit-file-1",
        filePath: "/portfolio/photo-delete.jpg"
      }]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (String(url).endsWith("/v1/files/imagekit-file-1")) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected delete URL: ${url}`);
  };
  const deleted = await dbWrite({
    httpMethod: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ table: "photos", op: "delete", filterValue: "photo-delete" })
  });
  assert.equal(deleted.statusCode, 200);
  assert.deepEqual(JSON.parse(deleted.body), { database: "deleted", imageCleanup: "deleted" });
  assert.match(deleteCalls[0].url, /[?&]select=cloudinary_id(?:&|$)/);
  assert.equal(deleteCalls[0].init.method, "DELETE");
  assert.equal(deleteCalls[0].init.headers.Prefer, "return=representation");
  assert.equal(deleteCalls[2].init.method, "DELETE");

  globalThis.fetch = async url => {
    if (String(url).startsWith(`${testEnv.SUPABASE_URL}/rest/v1/photos`)) {
      return new Response("not-json", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    throw new Error(`ImageKit cleanup should not run without a parsed delete representation: ${url}`);
  };
  const malformedDelete = await dbWrite({
    httpMethod: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ table: "photos", op: "delete", filterValue: "photo-malformed" })
  });
  assert.equal(malformedDelete.statusCode, 200);
  assert.deepEqual(JSON.parse(malformedDelete.body), { database: "completed", imageCleanup: "unknown" });

  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith(`${testEnv.SUPABASE_URL}/rest/v1/photos`)) {
      return new Response(JSON.stringify([{ cloudinary_id: "/portfolio/photo-timeout.jpg" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (String(url).includes("/v1/files?")) {
      return new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    }
    throw new Error(`Unexpected timeout-test URL: ${url}`);
  };
  const cleanupStarted = Date.now();
  const cleanupTimedOut = await dbWrite({
    httpMethod: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ table: "photos", op: "delete", filterValue: "photo-timeout" })
  });
  const cleanupElapsed = Date.now() - cleanupStarted;
  assert.equal(cleanupTimedOut.statusCode, 200);
  assert.deepEqual(JSON.parse(cleanupTimedOut.body), { database: "deleted", imageCleanup: "timed_out" });
  assert.ok(cleanupElapsed >= 2000 && cleanupElapsed < 6000, `Cleanup deadline was ${cleanupElapsed} ms`);

  console.log("Netlify function smoke checks passed.");
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
