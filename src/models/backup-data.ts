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
