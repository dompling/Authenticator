interface OTPEntryInterface {
  type: number; // OTPType
  index: number;
  issuer: string;
  encSecret: string | null;
  secret: string | null;
  account: string;
  copyPrefix: string | undefined;
  encCopyPrefix: string | undefined;
  hash: string;
  counter: number;
  code: string;
  period: number;
  digits: number;
  algorithm: number; // OTPAlgorithm
  pinned: boolean;
  getCopyText(defaultPrefix?: string): string;
  setCopyPrefix(prefix: string, encryption: EncryptionInterface): void;
  create(): Promise<void>;
  update(): Promise<void>;
  next(): Promise<void>;
  applyEncryption(encryption: EncryptionInterface): void;
  changeEncryption(encryption: EncryptionInterface): void;
  delete(): Promise<void>;
  generate(): void;
  genUUID(): void;
}

interface EncryptionInterface {
  getEncryptedString(data: string): string;
  getDecryptedString(data: string): string | null;
  getDecryptedSecret(entry: OTPStorage): string | null;
  getEncryptionStatus(): boolean;
  updateEncryptionPassword(password: string): void;
}

interface OTPStorage {
  account?: string;
  copyPrefix?: string;
  encrypted: boolean;
  hash: string;
  index: number;
  issuer?: string;
  secret: string;
  type: string;
  counter?: number;
  period?: number;
  digits?: number;
  algorithm?: string;
  pinned?: boolean;
}
