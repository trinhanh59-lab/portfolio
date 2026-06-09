const crypto = require("crypto");

const SESSION_TTL_SECONDS = 8 * 3600;

function createSessionToken(secret) {
  const expiry = Date.now() + SESSION_TTL_SECONDS * 1000;
  const sig = crypto.createHmac("sha256", secret).update(String(expiry)).digest("hex");
  return `${expiry}.${sig}`;
}

function timingSafeStringEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const ownerPassword = process.env.OWNER_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!ownerPassword || !sessionSecret) {
    return { statusCode: 500, body: "Server not configured" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const submitted = typeof body.password === "string" ? body.password : "";
  if (!submitted || !timingSafeStringEqual(submitted, ownerPassword)) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Incorrect password." })
    };
  }

  const token = createSessionToken(sessionSecret);
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, expiresInSeconds: SESSION_TTL_SECONDS })
  };
};
