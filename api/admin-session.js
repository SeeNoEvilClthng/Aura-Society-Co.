const { requireAdmin } = require("../lib/admin-auth");

// Lets the admin portal check a username/password before showing the editor.
module.exports = async function handler(request, response) {
  const send = (statusCode, data) => {
    response.statusCode = statusCode;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify(data));
  };

  if (request.method !== "POST") {
    send(405, { error: "Method not allowed." });
    return;
  }

  if (!(await requireAdmin(request, send))) return;
  send(200, { ok: true });
};
