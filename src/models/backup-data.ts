import * as CryptoJS from "crypto-js";
import { Encryption } from "./encryption";

export function decryptBackupData(
  backupData: { [hash: string]: OTPStorage },
  passphrase: string | null
) {
  const decrypted: { [hash: string]: OTPStorage } = {};
  const encryption = new Encryption(passphrase || "");
  for (const hash of Object.keys(backupData)) {
    const original = backupData[hash];
    if (!original || typeof original !== "object" || !original.secret) {
      continue;
    }
    const entry = { ...original };
    if (entry.encrypted) {
      if (!passphrase) {
        continue;
      }
      try {
        const secret = CryptoJS.AES.decrypt(entry.secret, passphrase).toString(
          CryptoJS.enc.Utf8
        );
        if (!secret) {
          continue;
        }
        if (entry.copyPrefix !== undefined) {
          const prefix = encryption.getDecryptedString(entry.copyPrefix);
          if (prefix === null) {
            continue;
          }
          entry.copyPrefix = prefix;
        }
        entry.secret = secret;
        entry.encrypted = false;
      } catch (error) {
        continue;
      }
    }
    decrypted[hash] = entry;
  }
  return decrypted;
}


// Cloud restore is deliberately stricter than the historical file importer:
// a corrupt record or a wrong password must not result in a partial restore.
export function decodeCloudBackup(input: unknown, passphrase: string) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid Authenticator backup");
  }
  const raw = input as {
    [key: string]: unknown;
    key?: { enc: string; hash: string };
  };
  const entries: { [hash: string]: OTPStorage } = Object.create(null);
  for (const hash of Object.keys(raw)) {
    if (["key", "enc", "hash"].includes(hash)) {
      continue;
    }
    if (["__proto__", "constructor", "prototype", "UserSettings"].includes(hash)) {
      throw new Error("Invalid account identifier in backup");
    }
    const item = raw[hash] as OTPStorage;
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.secret !== "string" ||
      !item.secret ||
      typeof item.encrypted !== "boolean" ||
      (item.hash !== undefined && item.hash !== hash) ||
      (item.issuer !== undefined && typeof item.issuer !== "string") ||
      (item.account !== undefined && typeof item.account !== "string") ||
      (item.copyPrefix !== undefined && typeof item.copyPrefix !== "string") ||
      !["totp", "hotp", "hex", "hhex", "battle", "steam"].includes(item.type)
    ) {
      throw new Error("Invalid account in backup");
    }
    entries[hash] = { ...item, hash };
  }
  const hashes = Object.keys(entries);
  if (!hashes.length) {
    throw new Error("Backup contains no accounts");
  }
  const encrypted = hashes.some((hash) => entries[hash].encrypted);
  let password = passphrase;
  const wrappedKey =
    raw.key || (typeof raw.enc === "string" ? { enc: raw.enc } : undefined);
  if (encrypted && !passphrase) {
    throw new Error("Enter the backup encryption password");
  }
  if (encrypted && wrappedKey) {
    if (typeof wrappedKey.enc !== "string") {
      throw new Error("Invalid backup encryption key");
    }
    password = CryptoJS.AES.decrypt(wrappedKey.enc, passphrase).toString();
    // Modern backups wrap a 120-byte random data key.
    if (!/^[0-9a-f]{240}$/i.test(password)) {
      throw new Error("Incorrect backup password or damaged encryption key");
    }
  }
  const decoded = decryptBackupData(entries, password || null);
  for (const hash of hashes) {
    const item = decoded[hash];
    if (
      !item ||
      item.secret.length < 8 ||
      !/^(?:[a-z2-7]+=*|[0-9a-f]+|(?:blz-|bliz-|stm-).+)$/i.test(item.secret)
    ) {
      throw new Error("Incorrect backup password or damaged account data");
    }
  }
  return decoded;
}

function accountIdentity(entry: OTPStorage) {
  // Do not collapse separate named accounts that happen to share a secret.
  return JSON.stringify([
    (entry.issuer || "").trim().toLowerCase(),
    (entry.account || "").trim().toLowerCase(),
    entry.secret.replace(/=+$/, "").toUpperCase(),
    entry.type,
    entry.algorithm || "SHA1",
    entry.digits || 6,
    entry.period || 30,
  ]);
}

export function planCloudRestore(
  incoming: { [hash: string]: OTPStorage },
  existing: { [hash: string]: OTPStorage }
) {
  const hashes = new Set(Object.keys(existing));
  const identities = new Set(
    Object.keys(existing).map((hash) => accountIdentity(existing[hash]))
  );
  const additions: { [hash: string]: OTPStorage } = Object.create(null);
  let skipped = 0;
  for (const hash of Object.keys(incoming)) {
    const entry = incoming[hash];
    const identity = accountIdentity(entry);
    if (hashes.has(hash) || identities.has(identity)) {
      skipped++;
      continue;
    }
    additions[hash] = { ...entry };
    hashes.add(hash);
    identities.add(identity);
  }
  return { additions, skipped };
}
