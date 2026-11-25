const fs = require("node:fs");
const crypto = require("node:crypto");

// Public key only. Chrome derives its extension ID from this value.
const publicKey = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApUxaYiEIScB7/9JOdmn+XDBT3xW65Bg76SYx5p6YgCmAUyeOBqBYQh49S7TAMp2m6afd8PqiAyLkQlCM3VCi0I2ApXLUR30+zlDpzPr/sI7CrfjQRHOd0gbTtkMqpKvJ7jjYs9FhDQveTN1sg7oy0QlLJ92Qcpfn6aQ2DkNoTcAGRHt+tkQkiD8PA5XlXoSHzuYuT2DtLnyTABPjQtbUkKbbYLQyGEi5JX0yzOXkr6I/cFKS4OI/O7aAzITxfuYS5Izf9L2wHsoq9GNK+/fRI7b4QdVls8Dd1CWE/EykQuSpo3nKwANbtJwyB480w1SRc62g9QGd5qXJY/GrCNkfHQIDAQAB";
const manifestPath = process.argv[2] || "chrome/manifest.json";
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
// A public OAuth client ID is safe to distribute in the manifest.
const clientId = (
  process.env.CHROME_GOOGLE_CLIENT_ID || manifest.oauth2?.client_id || ""
).trim();
const stableId = process.env.CHROME_STABLE_ID === "true" || Boolean(clientId);
if (clientId && !/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
  throw new Error("Invalid Chrome OAuth client ID");
}
if (stableId) {
  manifest.key = publicKey;
  const id = crypto.createHash("sha256").update(Buffer.from(publicKey, "base64"))
    .digest("hex").slice(0, 32).replace(/[0-9a-f]/g, (c) => "abcdefghijklmnop"[parseInt(c, 16)]);
  if (id !== "aghhgbfijfbebmpcaogdadknmiadiffk") {
    throw new Error("Chrome extension ID does not match the registered OAuth item ID");
  }
  console.log("Stable Chrome extension ID:", id);
} else {
  delete manifest.key;
  console.log("Keeping existing unpacked-path extension ID.");
}
if (clientId) {
  manifest.oauth2 = { client_id: clientId, scopes: ["https://www.googleapis.com/auth/drive.file"] };
} else {
  delete manifest.oauth2;
  console.log("Google Drive OAuth is not configured for this build.");
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
