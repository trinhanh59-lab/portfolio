const crypto = require("crypto");

const SIGNATURE_TTL_SECONDS = 600;

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
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const sessionSecret = process.env.SESSION_SECRET;
  const ikPrivateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const ikPublicKey = process.env.IMAGEKIT_PUBLIC_KEY;
  const missingEnv = [
    ["SESSION_SECRET", sessionSecret],
    ["IMAGEKIT_PRIVATE_KEY", ikPrivateKey],
    ["IMAGEKIT_PUBLIC_KEY", ikPublicKey]
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missingEnv.length) {
    console.error(`imagekit-auth missing environment variables: ${missingEnv.join(", ")}`);
    return { statusCode: 500, body: "Server not configured" };
  }

  const token = bearerTokenFromHeaders(event.headers);
  if (!verifySessionToken(token, sessionSecret)) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const ikToken = crypto.randomBytes(16).toString("hex");
  const expire = Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS;
  const signature = crypto
    .createHmac("sha1", ikPrivateKey)
    .update(ikToken + expire)
    .digest("hex");

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify({ token: ikToken, expire, signature, publicKey: ikPublicKey })
  };
};
