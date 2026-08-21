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

  console.log("Netlify function smoke checks passed.");
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
