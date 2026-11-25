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
