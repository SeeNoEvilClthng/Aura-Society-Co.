const crypto = require("crypto");

const FAILED_LOGIN_DELAY_MS = 800;

// Admin credentials live only in server env vars (ADMIN_USERNAME / ADMIN_PASSWORD).
// The admin portal sends them as an HTTP Basic Authorization header on every write.
function getAdminConfigError() {
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    return "Admin login is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD in your environment variables.";
  }
  return "";
}

function isAdminRequest(request) {
  if (getAdminConfigError()) return false;

  const header = String((request.headers || {}).authorization || "");
  const match = /^Basic\s+(.+)$/i.exec(header);
  if (!match) return false;

  let decoded;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return false;
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) return false;

  const usernameOk = safeEqual(decoded.slice(0, separator), process.env.ADMIN_USERNAME);
  const passwordOk = safeEqual(decoded.slice(separator + 1), process.env.ADMIN_PASSWORD);
  return usernameOk && passwordOk;
}

// Sends a 401/503 and returns false when the request is not from the admin.
async function requireAdmin(request, send) {
  const configError = getAdminConfigError();
  if (configError) {
    send(503, { error: configError });
    return false;
  }

  if (!isAdminRequest(request)) {
    await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
    send(401, { error: "Admin login required." });
    return false;
  }

  return true;
}

function safeEqual(left, right) {
  const leftHash = crypto.createHash("sha256").update(String(left)).digest();
  const rightHash = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

module.exports = { requireAdmin };
