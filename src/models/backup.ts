import { getCredentials } from "./credentials";
import { Encryption } from "./encryption";
import { UserSettings } from "./settings";
import { EntryStorage } from "./storage";

export class Dropbox implements BackupProvider {
  private async getToken() {
    await UserSettings.updateItems();
    return UserSettings.items.dropboxToken || "";
  }

  async upload(encryption: Encryption) {
    await UserSettings.updateItems();

    if (UserSettings.items.dropboxEncrypted === undefined) {
      // Encrypt by default if user hasn't set yet
      UserSettings.items.dropboxEncrypted = true;
      UserSettings.commitItems();
    }
    const exportData = await EntryStorage.backupGetExport(
      encryption,
      UserSettings.items.dropboxEncrypted === true
    );
    const backup = JSON.stringify(exportData, null, 2);

    const url = "https://content.dropboxapi.com/2/files/upload";
    const token = await this.getToken();
    return new Promise(
      (resolve: (value: boolean) => void, reject: (reason: Error) => void) => {
        if (!token) {
          return resolve(false);
        }
        try {
          const xhr = new XMLHttpRequest();
          const now = new Date().toISOString().slice(0, 10).replace(/-/g, "");
          const apiArg = {
            path: `/${now}.json`,
            mode: "add",
            autorename: true,
          };
          xhr.open("POST", url);
          xhr.setRequestHeader("Authorization", "Bearer " + token);
          xhr.setRequestHeader("Content-type", "application/octet-stream");
          xhr.setRequestHeader("Dropbox-API-Arg", JSON.stringify(apiArg));
          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
              if (xhr.status === 401) {
                UserSettings.items.dropboxToken = undefined;
                UserSettings.items.dropboxRevoked = true;
                UserSettings.commitItems();
                return resolve(false);
              }
              try {
                const res = JSON.parse(xhr.responseText);
                if (res.name) {
                  resolve(true);
                } else {
                  resolve(false);
                }
              } catch (error) {
                reject(error as Error);
              }
            }
            return;
          };
          xhr.send(backup);
        } catch (error) {
          return reject(error as Error);
        }
      }
    );
  }
  async getUser() {
    await UserSettings.updateItems();
    const url = "https://api.dropboxapi.com/2/users/get_current_account";
    const token = await this.getToken();
    return new Promise((resolve: (value: string) => void) => {
      if (!token) {
        return resolve("Error: No token");
      }
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("Authorization", "Bearer " + token);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 401) {
            UserSettings.items.dropboxToken = undefined;
            UserSettings.items.dropboxRevoked = true;
            UserSettings.commitItems();
            resolve(
              "Error: Response was 401. You will be logged out the next time you open Authenticator."
            );
          }
          try {
            const res = JSON.parse(xhr.responseText);
            if (res.email) {
              resolve(res.email);
            } else {
              console.error("Could not find email in response.", res);
              resolve("Error: res.email was undefined.");
            }
          } catch (e) {
            console.error(e);
            resolve("Error");
          }
        }
        return;
      };
      xhr.send(null);
    });
  }
}

class DriveApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    Object.setPrototypeOf(this, DriveApiError.prototype);
  }
}

async function driveFetch(url: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (error) {
      throw new DriveApiError(response.status, "Invalid Google Drive response");
    }
    if (!response.ok || data.error) {
      const error = data.error;
      const reason =
        error?.details?.find(
          (detail: { reason?: string }) => detail.reason
        )?.reason || error?.errors?.[0]?.reason;
      const message =
        error?.message || data.error_description || response.statusText;
      throw new DriveApiError(
        response.status,
        "Google Drive HTTP " +
          response.status +
          (reason ? " [" + reason + "]" : "") +
          (message ? ": " + message : "")
      );
    }
    return data;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Google Drive request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export interface DriveBackupFile {
  id: string;
  name: string;
  modifiedTime: string;
}

export class Drive implements BackupProvider {
  private get nativeChrome() {
    const agent = navigator.userAgent;
    return (
      agent.indexOf("Chrome") !== -1 &&
      agent.indexOf("OPR") === -1 &&
      agent.indexOf("Edg") === -1
    );
  }

  private async refreshToken() {
    await UserSettings.updateItems();
    let token: string | undefined;
    if (this.nativeChrome) {
      token = await new Promise<string | undefined>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Google authorization timed out")),
          15000
        );
        chrome.identity.getAuthToken(
          {
            interactive: false,
            scopes: ["https://www.googleapis.com/auth/drive.file"],
          },
          (value) => {
            clearTimeout(timer);
            const error = chrome.runtime.lastError;
            if (error || !value) {
              resolve(undefined);
            } else {
              resolve(value);
            }
          }
        );
      });
    } else if (UserSettings.items.driveRefreshToken) {
      const credentials = getCredentials().drive;
      const body = new URLSearchParams();
      body.set("client_id", credentials.client_id);
      body.set("client_secret", credentials.client_secret);
      body.set("refresh_token", UserSettings.items.driveRefreshToken);
      body.set("grant_type", "refresh_token");
      const result = await driveFetch(
        "https://www.googleapis.com/oauth2/v4/token",
        {
          method: "POST",
          body: body.toString(),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );
      token = result.access_token;
    }
    await UserSettings.updateItems();
    UserSettings.items.driveToken = token;
    UserSettings.items.driveRevoked = !token;
    await UserSettings.commitItems();
    return token;
  }

  private async getToken() {
    await UserSettings.updateItems();
    return UserSettings.items.driveToken || (await this.refreshToken());
  }

  private async request(path: string, options: RequestInit = {}) {
    let token = await this.getToken();
    if (!token) {
      throw new Error("Google authorization expired; sign in again");
    }
    const url = "https://www.googleapis.com" + path;
    const send = (accessToken: string) =>
      driveFetch(url, {
        ...options,
        headers: {
          Accept: "application/json",
          ...options.headers,
          Authorization: "Bearer " + accessToken,
        },
      });
    try {
      return await send(token);
    } catch (error) {
      if (!(error instanceof DriveApiError) || error.status !== 401) {
        throw error;
      }
      if (this.nativeChrome) {
        await chrome.identity.removeCachedAuthToken({ token });
      }
      await UserSettings.updateItems();
      UserSettings.items.driveToken = undefined;
      await UserSettings.commitItems();
      token = await this.refreshToken();
      if (!token) {
        throw new Error("Google authorization expired; sign in again");
      }
      return await send(token);
    }
  }

  private async getFolder(): Promise<string> {
    await UserSettings.updateItems();
    const cached = UserSettings.items.driveFolder;
    if (cached) {
      try {
        const result = await this.request(
          "/drive/v3/files/" + encodeURIComponent(cached) + "?fields=id,trashed"
        );
        if (!result.trashed && result.id) {
          return result.id;
        }
      } catch (error) {
        if (!(error instanceof DriveApiError) || error.status !== 404) {
          throw error;
        }
      }
    }

    const query = new URLSearchParams({
      q: "name = 'Authenticator Backups' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id),nextPageToken",
      pageSize: "100",
    });
    const folders = await this.request("/drive/v3/files?" + query.toString());
    const existing = folders.files?.[0]?.id;
    const folder =
      existing ||
      (
        await this.request("/drive/v3/files?fields=id", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Authenticator Backups",
            mimeType: "application/vnd.google-apps.folder",
          }),
        })
      ).id;
    if (!folder) {
      throw new Error("Google Drive backup folder was not created");
    }
    await UserSettings.updateItems();
    UserSettings.items.driveFolder = folder;
    await UserSettings.commitItems();
    return folder;
  }

  async upload(encryption: Encryption) {
    await UserSettings.updateItems();
    if (!encryption.getEncryptionStatus()) {
      throw new Error("Set and unlock the main encryption password first");
    }
    const exportData = await EntryStorage.backupGetExport(encryption, true);
    const hashes = Object.keys(exportData).filter((hash) => hash !== "key");
    if (!hashes.length) {
      throw new Error("No accounts to back up");
    }
    if (hashes.some((hash) => !exportData[hash].encrypted)) {
      throw new Error("Backup contains unencrypted accounts");
    }
    const folder = await this.getFolder();
    const boundary = "authenticator_" + Date.now();
    const now = new Date().toISOString().replace(/[:.]/g, "-");
    const body = [
      "--" + boundary,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify({ name: now + ".json", parents: [folder] }),
      "--" + boundary,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(exportData, null, 2),
      "--" + boundary + "--",
      "",
    ].join("\r\n");
    const result = await this.request(
      "/upload/drive/v3/files?uploadType=multipart&fields=id",
      {
        method: "POST",
        headers: { "Content-Type": "multipart/related; boundary=" + boundary },
        body,
      }
    );
    if (result.id) {
      await UserSettings.updateItems();
      UserSettings.items.driveLastBackupTime = Date.now();
      UserSettings.items.driveLastBackupError = undefined;
      await UserSettings.commitItems();
    }
    return Boolean(result.id);
  }

  private async listFiles(query: string, fields: string) {
    const files: DriveBackupFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: query,
        fields: "nextPageToken,files(" + fields + ")",
        pageSize: "100",
      });
      if (pageToken) {
        params.set("pageToken", pageToken);
      }
      const result = await this.request(
        "/drive/v3/files?" + params.toString()
      );
      files.push(...(result.files || []));
      pageToken = result.nextPageToken;
    } while (pageToken);
    return files;
  }

  async listBackups(): Promise<DriveBackupFile[]> {
    // Reading history never creates folders or uploads anything.
    const folders = await this.listFiles(
      "name = 'Authenticator Backups' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      "id"
    );
    const files: DriveBackupFile[] = [];
    for (const folder of folders) {
      if (!/^[a-zA-Z0-9_-]+$/.test(folder.id)) {
        continue;
      }
      const results = await this.listFiles(
        "'" + folder.id + "' in parents and trashed = false",
        "id,name,modifiedTime"
      );
      files.push(
        ...results.filter((file) => /\.json$/i.test(file.name))
      );
    }
    return files.sort(
      (a, b) =>
        new Date(b.modifiedTime).getTime() -
        new Date(a.modifiedTime).getTime()
    );
  }

  async downloadBackup(fileId: string): Promise<unknown> {
    if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      throw new Error("Invalid backup file ID");
    }
    return this.request(
      "/drive/v3/files/" + encodeURIComponent(fileId) + "?alt=media"
    );
  }

  async getUser(): Promise<string> {
    const result = await this.request(
      "/drive/v3/about?fields=user(emailAddress,displayName)"
    );
    return result.user?.emailAddress || result.user?.displayName || "Google Drive";
  }

  async logout() {
    await UserSettings.updateItems();
    const token = UserSettings.items.driveToken;
    if (token) {
      try {
        await driveFetch("https://accounts.google.com/o/oauth2/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }).toString(),
        });
      } catch (error) {
        // Local logout must still work if Google is temporarily unreachable.
      }
      if (this.nativeChrome) {
        try {
          await chrome.identity.removeCachedAuthToken({ token });
        } catch (error) {
          // The cache may already have been cleared.
        }
      }
    }
    await UserSettings.updateItems();
    UserSettings.items.driveToken = undefined;
    UserSettings.items.driveRefreshToken = undefined;
    UserSettings.items.driveFolder = undefined;
    UserSettings.items.driveRevoked = false;
    UserSettings.items.driveAutoBackup = false;
    UserSettings.items.driveLastBackupTime = undefined;
    UserSettings.items.driveLastBackupError = undefined;
    await UserSettings.commitItems();
  }
}

export class OneDrive implements BackupProvider {
  private async getToken() {
    await UserSettings.updateItems();
    if (
      !UserSettings.items.oneDriveToken ||
      (await new Promise(
        (
          resolve: (value: boolean) => void,
          reject: (reason: Error) => void
        ) => {
          const xhr = new XMLHttpRequest();
          xhr.open(
            "GET",
            "https://graph.microsoft.com/v1.0/me/drive/special/approot"
          );
          xhr.setRequestHeader(
            "Authorization",
            "Bearer " + UserSettings.items.oneDriveToken
          );
          xhr.onreadystatechange = async () => {
            if (xhr.readyState === 4) {
              try {
                const res = JSON.parse(xhr.responseText);
                if (res.error) {
                  if (res.error.code === 401) {
                    UserSettings.items.oneDriveToken = undefined;
                    UserSettings.commitItems();
                    resolve(true);
                  }
                } else {
                  resolve(false);
                }
              } catch (error) {
                console.error(error);
                reject(error as Error);
              }
            }
            return;
          };
          xhr.send();
        }
      ))
    ) {
      await this.refreshToken();
    }
    return UserSettings.items.oneDriveToken;
  }

  private async refreshToken() {
    await UserSettings.updateItems();
    return new Promise(
      (resolve: (value: boolean) => void, reject: (reason: Error) => void) => {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "POST",
          "https://login.microsoftonline.com/common/oauth2/v2.0/token"
        );
        xhr.setRequestHeader(
          "Content-Type",
          "application/x-www-form-urlencoded"
        );
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            if (xhr.status === 401) {
              UserSettings.items.oneDriveRefreshToken = undefined;
              UserSettings.items.oneDriveRevoked = true;
              UserSettings.commitItems();
              return resolve(false);
            }
            try {
              const res = JSON.parse(xhr.responseText);
              if (res.error) {
                if (res.error === "invalid_grant") {
                  UserSettings.items.oneDriveRefreshToken = undefined;
                  UserSettings.items.oneDriveRevoked = true;
                  UserSettings.commitItems();
                }
                console.error(res.error_description);
                resolve(false);
              } else {
                UserSettings.items.oneDriveToken = res.access_token;
                UserSettings.commitItems();
                resolve(true);
              }
            } catch (error) {
              console.error(error);
              reject(error as Error);
            }
          }
          return;
        };
        xhr.send(
          `client_id=${getCredentials().onedrive.client_id}&refresh_token=${
            UserSettings.items.oneDriveRefreshToken
          }&client_secret=${encodeURIComponent(
            getCredentials().onedrive.client_secret
          )}&grant_type=refresh_token&scope=https%3A%2F%2Fgraph.microsoft.com%2FFiles.ReadWrite${
            UserSettings.items.oneDriveBusiness !== true ? ".AppFolder" : ""
          }%20https%3A%2F%2Fgraph.microsoft.com%2FUser.Read%20offline_access`
        );
      }
    );
  }

  async upload(encryption: Encryption) {
    await UserSettings.updateItems();
    if (UserSettings.items.oneDriveEncrypted === undefined) {
      UserSettings.items.oneDriveEncrypted = true;
    }
    const exportData = await EntryStorage.backupGetExport(
      encryption,
      UserSettings.items.oneDriveEncrypted === true
    );
    const backup = JSON.stringify(exportData, null, 2);

    const token = await this.getToken();
    if (!token) {
      return false;
    }

    return new Promise(
      (resolve: (value: boolean) => void, reject: (reason: Error) => void) => {
        if (!token) {
          return resolve(false);
        }
        try {
          const xhr = new XMLHttpRequest();
          const now = new Date().toISOString().slice(0, 10).replace(/-/g, "");
          xhr.open(
            "PUT",
            `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${now}.json:/content`
          );
          xhr.setRequestHeader("Authorization", "Bearer " + token);
          xhr.setRequestHeader("Content-type", "application/octet-stream");
          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
              if (xhr.status === 401) {
                UserSettings.removeItem("oneDriveToken");
                return resolve(false);
              }
              try {
                const res = JSON.parse(xhr.responseText);
                if (!res.error) {
                  resolve(true);
                } else {
                  console.error(res.error.message);
                  resolve(false);
                }
              } catch (error) {
                reject(error as Error);
              }
            }
            return;
          };
          xhr.send(backup);
        } catch (error) {
          return reject(error as Error);
        }
      }
    );
  }

  async getUser() {
    const token = await this.getToken();
    if (!token) {
      return "Error: Access revoked or expired.";
    }

    await UserSettings.updateItems();

    return new Promise((resolve: (value: string) => void) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "https://graph.microsoft.com/v1.0/me/");
      xhr.setRequestHeader("Authorization", "Bearer " + token);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 401) {
            UserSettings.items.oneDriveToken = undefined;
            UserSettings.commitItems();
            resolve(
              "Error: Response was 401. You will be logged out the next time you open Authenticator."
            );
          }
          try {
            const res = JSON.parse(xhr.responseText);
            if (!res.error) {
              resolve(res.userPrincipalName);
            } else {
              console.error(res.error.message);
              resolve("Error");
            }
          } catch (e) {
            console.error(e);
            resolve("Error");
          }
        }
        return;
      };
      xhr.send();
    });
  }
}
