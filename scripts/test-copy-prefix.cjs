const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");

// Use the project's actual TypeScript modules without launching a browser.
require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  module._compile(outputText, filename);
};

const { OTPEntry, OTPType } = require("../src/models/otp.ts");
const { Encryption } = require("../src/models/encryption.ts");
const { EntryStorage, BrowserStorage } = require("../src/models/storage.ts");
const { decryptBackupData } = require("../src/models/backup-data.ts");

const secret = "JBSWY3DPEHPK3PXP";
const prefix = "00- 测试#";
function makeEntry(copyPrefix, encryption) {
  const entry = new OTPEntry(
    { type: OTPType.hotp, index: 0, encrypted: false, secret, copyPrefix },
    encryption
  );
  entry.code = "012345";
  return entry;
}

test("each account uses its own prefix and legacy defaults remain compatible", () => {
  assert.equal(makeEntry(prefix).getCopyText("GLOBAL"), prefix + "012345");
  assert.equal(makeEntry("B").getCopyText("GLOBAL"), "B012345");
  assert.equal(makeEntry("").getCopyText("GLOBAL"), "012345");
  assert.equal(makeEntry(undefined).getCopyText("GLOBAL"), "GLOBAL012345");
  assert.equal(makeEntry(undefined).getCopyText(), "012345");
});

test("plain and encrypted JSON backups retain prefix, empty override, and old data", async () => {
  const key = new Encryption("test-passphrase");
  const entry = makeEntry(prefix, key);
  const empty = makeEntry("", key);
  const legacy = makeEntry(undefined, key);
  const all = [entry, empty, legacy];
  const plain = EntryStorage.getExport(all);
  const encrypted = EntryStorage.getExport(all, true);
  assert.equal(plain[entry.hash].copyPrefix, prefix);
  assert.equal(plain[empty.hash].copyPrefix, "");
  assert.equal(plain[legacy.hash].copyPrefix, undefined);
  assert.notEqual(encrypted[entry.hash].copyPrefix, prefix);
  assert.equal(encrypted[entry.hash].encrypted, true);
  assert.equal(encrypted[legacy.hash].copyPrefix, undefined);
  const restored = decryptBackupData(JSON.parse(JSON.stringify(encrypted)), "test-passphrase");
  assert.equal(restored[entry.hash].copyPrefix, prefix);
  assert.equal(restored[empty.hash].copyPrefix, "");
  assert.equal(restored[legacy.hash].copyPrefix, undefined);
  assert.deepEqual(decryptBackupData(encrypted, null), {});

  let stored = {};
  BrowserStorage.get = async () => JSON.parse(JSON.stringify(stored));
  BrowserStorage.set = async (data) => { stored = { ...stored, ...data }; };
  BrowserStorage.getKey = async () => null;
  const newKey = new Encryption("new-passphrase");
  await EntryStorage.import(newKey, restored);
  assert.notEqual(stored[entry.hash].copyPrefix, prefix);
  const entries = await EntryStorage.get();
  const reloaded = entries.find((item) => item.hash === entry.hash);
  assert.equal(reloaded.copyPrefix, undefined);
  reloaded.applyEncryption(newKey);
  assert.equal(reloaded.copyPrefix, prefix);
  reloaded.code = "012345";
  assert.equal(reloaded.getCopyText("GLOBAL"), prefix + "012345");
  reloaded.setCopyPrefix("new-", newKey);
  await reloaded.update();
  assert.equal((await EntryStorage.backupGetExport(newKey, false))[entry.hash].copyPrefix, "new-");
  assert.notEqual((await EntryStorage.backupGetExport(newKey, true))[entry.hash].copyPrefix, "new-");
  reloaded.changeEncryption(key);
  assert.equal(key.getDecryptedString(reloaded.encCopyPrefix), "new-");
  reloaded.changeEncryption(new Encryption(""));
  assert.equal(EntryStorage.getExport([reloaded])[entry.hash].copyPrefix, "new-");
});

test("legacy global value migrates only old entries and survives complete backup", async () => {
  const { UserSettings } = require("../src/models/settings.ts");
  const key = new Encryption("legacy-test-key");
  const old = makeEntry(undefined, key);
  const explicit = makeEntry("personal-", key);
  const cleared = makeEntry("", key);
  const initial = EntryStorage.getExport([old, explicit, cleared], true);
  let stored = JSON.parse(JSON.stringify(initial));
  BrowserStorage.get = async () => JSON.parse(JSON.stringify(stored));
  BrowserStorage.set = async (data) => { stored = { ...stored, ...data }; };
  BrowserStorage.getKey = async () => null;
  UserSettings.items.staticPassword = "legacy-";
  const beforePopup = await EntryStorage.backupGetExport(key, true);
  assert.equal(key.getDecryptedString(beforePopup[old.hash].copyPrefix), "legacy-");
  const locked = await EntryStorage.get();
  await EntryStorage.migrateLegacyCopyPrefixes(locked, new Encryption(""));
  assert.equal(stored[old.hash].copyPrefix, undefined);
  for (const entry of locked) entry.applyEncryption(key);
  await EntryStorage.migrateLegacyCopyPrefixes(locked, key);
  assert.equal(key.getDecryptedString(stored[old.hash].copyPrefix), "legacy-");
  assert.equal(key.getDecryptedString(stored[explicit.hash].copyPrefix), "personal-");
  assert.equal(key.getDecryptedString(stored[cleared.hash].copyPrefix), "");
  const restored = decryptBackupData(await EntryStorage.backupGetExport(key, true), "legacy-test-key");
  assert.equal(restored[old.hash].copyPrefix, "legacy-");
  assert.equal(restored[explicit.hash].copyPrefix, "personal-");
  assert.equal(restored[cleared.hash].copyPrefix, "");
  UserSettings.items.staticPassword = undefined;
});

test("Drive API displays 403 rather than hanging and loads account through v3", async () => {
  const { Drive } = require("../src/models/backup.ts");
  const { UserSettings } = require("../src/models/settings.ts");
  const originalFetch = global.fetch;
  const originalUpdate = UserSettings.updateItems;
  const originalItems = UserSettings.items;
  UserSettings.items = { driveToken: "test-token" };
  UserSettings.updateItems = async () => {};
  try {
    global.fetch = async (url, options) => {
      assert.match(url, /\/drive\/v3\/about\?fields=user/);
      assert.equal(options.headers.Authorization, "Bearer test-token");
      return new Response(JSON.stringify({
        error: { code: 403, message: "Drive API has not been enabled", errors: [{ reason: "accessNotConfigured" }] }
      }), { status: 403 });
    };
    await assert.rejects(new Drive().getUser(), /403.*accessNotConfigured/);
    global.fetch = async () => new Response(JSON.stringify({
      user: { emailAddress: "test@example.com" }
    }), { status: 200 });
    assert.equal(await new Drive().getUser(), "test@example.com");
  } finally {
    global.fetch = originalFetch;
    UserSettings.updateItems = originalUpdate;
    UserSettings.items = originalItems;
  }
});

test("cloud history reads all matching folders and sorts snapshots newest first", async () => {
  const { Drive } = require("../src/models/backup.ts");
  const { UserSettings } = require("../src/models/settings.ts");
  const originalFetch = global.fetch;
  const originalUpdate = UserSettings.updateItems;
  const originalItems = UserSettings.items;
  UserSettings.items = { driveToken: "test-token" };
  UserSettings.updateItems = async () => {};
  try {
    global.fetch = async (url, options) => {
      assert.equal(options.headers.Authorization, "Bearer test-token");
      const parsed = new URL(url);
      const q = parsed.searchParams.get("q");
      let result;
      if (parsed.searchParams.get("alt") === "media") {
        result = { sample: "backup" };
      } else if (q.includes("mimeType")) {
        result = { files: [{ id: "folder1" }, { id: "folder2" }] };
      } else if (q.includes("folder1")) {
        result = parsed.searchParams.get("pageToken")
          ? { files: [{ id: "older", name: "older.json", modifiedTime: "2025-01-01" }] }
          : { nextPageToken: "next", files: [{ id: "old", name: "old.json", modifiedTime: "2026-01-01" }] };
      } else {
        result = { files: [{ id: "new", name: "new.json", modifiedTime: "2026-11-01" }, { id: "ignore", name: "notes.txt" }] };
      }
      return new Response(JSON.stringify(result), { status: 200 });
    };
    assert.deepEqual((await new Drive().listBackups()).map((file) => file.id), ["new", "old", "older"]);
    assert.deepEqual(await new Drive().downloadBackup("new"), { sample: "backup" });
    await assert.rejects(new Drive().downloadBackup("../bad"), /Invalid backup file ID/);
  } finally {
    global.fetch = originalFetch;
    UserSettings.updateItems = originalUpdate;
    UserSettings.items = originalItems;
  }
});

test("cloud restore verifies the entire encrypted snapshot and never overwrites local records", async () => {
  const CryptoJS = require("crypto-js");
  const { decodeCloudBackup, planCloudRestore } = require("../src/models/backup-data.ts");
  const dataKey = CryptoJS.lib.WordArray.random(120);
  const source = new Encryption(dataKey.toString());
  const first = makeEntry("cloud-old-", source);
  first.account = "existing";
  const second = makeEntry("cloud-new-", source);
  second.account = "new";
  const encrypted = EntryStorage.getExport([first, second], true);
  const snapshot = { ...encrypted, key: { enc: CryptoJS.AES.encrypt(dataKey, "master-password").toString(), hash: "test" } };
  assert.throws(() => decodeCloudBackup(snapshot, "wrong-password"));
  const corrupt = JSON.parse(JSON.stringify(snapshot));
  corrupt[second.hash].secret = "broken";
  assert.throws(() => decodeCloudBackup(corrupt, "master-password"));
  const decoded = decodeCloudBackup(snapshot, "master-password");
  assert.equal(decoded[second.hash].copyPrefix, "cloud-new-");
  const localKey = new Encryption("local-key");
  const existing = new OTPEntry({ type: OTPType.hotp, encrypted: false, index: 0, hash: first.hash, secret, account: "existing", copyPrefix: "local-" }, localKey);
  existing.code = "012345";
  let stored = EntryStorage.getExport([existing], true);
  const oldRecord = JSON.stringify(stored[first.hash]);
  BrowserStorage.get = async () => JSON.parse(JSON.stringify(stored));
  BrowserStorage.set = async (data) => { stored = { ...stored, ...data }; };
  const duplicate = { ...decoded[first.hash], hash: "other-id" };
  const local = EntryStorage.getExport([existing]);
  const plan = planCloudRestore({ ...decoded, "other-id": duplicate }, local);
  assert.equal(plan.skipped, 2);
  assert.deepEqual(Object.keys(plan.additions), [second.hash]);
  assert.equal(await EntryStorage.import(localKey, plan.additions, true), 1);
  assert.equal(JSON.stringify(stored[first.hash]), oldRecord);
  assert.equal(localKey.getDecryptedString(stored[second.hash].copyPrefix), "cloud-new-");
  assert.equal(await EntryStorage.import(localKey, { [first.hash]: decoded[first.hash] }, true), 0);
  assert.equal(JSON.stringify(stored[first.hash]), oldRecord);
});

test("latest cloud backup reflects file creation time rather than later edits", async () => {
  const { Drive } = require("../src/models/backup.ts");
  const { UserSettings } = require("../src/models/settings.ts");
  const originalFetch = global.fetch;
  const originalUpdate = UserSettings.updateItems;
  const originalItems = UserSettings.items;
  UserSettings.items = { driveToken: "test-token" };
  UserSettings.updateItems = async () => {};
  try {
    global.fetch = async (url, options) => {
      assert.equal(options.method, undefined);
      const parsed = new URL(url);
      const query = parsed.searchParams.get("q");
      const fields = parsed.searchParams.get("fields");
      const files = query.includes("mimeType")
        ? [{ id: "folder1" }]
        : [
          { id: "older", name: "old.json", createdTime: "2026-10-01", modifiedTime: "2026-11-25", size: "100" },
          { id: "latest", name: "latest.json", createdTime: "2026-11-24", modifiedTime: "2026-11-24", size: "2048" },
        ];
      if (!query.includes("mimeType")) {
        assert.match(fields, /createdTime/);
        assert.match(fields, /size/);
      }
      return new Response(JSON.stringify({ files }), { status: 200 });
    };
    const backups = await new Drive().listBackups();
    assert.equal(backups[0].id, "latest");
    assert.equal(backups[0].size, "2048");
  } finally {
    global.fetch = originalFetch;
    UserSettings.updateItems = originalUpdate;
    UserSettings.items = originalItems;
  }
});
