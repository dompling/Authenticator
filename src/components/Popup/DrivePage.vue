<template>
  <div>
    <div class="text warning" v-if="!configured">
      {{ i18n.drive_not_configured }}
    </div>
    <div class="text warning" v-if="!encryption.getEncryptionStatus()">
      {{ i18n.drive_require_password }}
    </div>
    <div v-if="backupToken">
      <div class="text" style="overflow-wrap: break-word">
        {{ i18n.account }} - {{ email }}
      </div>
    </div>
    <div class="text warning" v-if="errorMessage" style="overflow-wrap: anywhere">
      {{ errorMessage }}
    </div>
    <div class="text" v-if="busy">{{ i18n.loading }}</div>
    <a-button v-if="configured && !backupToken && !busy" @click="getBackupToken()">
      {{ i18n.sign_in }}
    </a-button>
    <a-button v-if="backupToken && !busy" @click="backupLogout()">
      {{ i18n.log_out }}
    </a-button>
    <a-button v-if="backupToken && errorMessage && !busy" @click="loadUser()">
      {{ retryLabel }}
    </a-button>
    <a-button
      v-if="configured && backupToken && encryption.getEncryptionStatus() && !busy"
      @click="backupUpload()"
    >
      {{ i18n.manual_dropbox }}
    </a-button>
    <a-button v-if="backupToken && !busy" @click="loadBackups()">
      {{ i18n.drive_history }}
    </a-button>
    <div v-if="backupToken && !busy">
      <a-toggle-input
        :label="i18n.drive_auto_backup"
        v-model="autoBackup"
        @change="saveAutoBackup()"
      />
      <div class="text">{{ i18n.drive_auto_help }}</div>
      <div class="text" v-if="lastBackup">{{ i18n.drive_last_backup }}: {{ lastBackup }}</div>
      <div class="text warning" v-if="autoError">{{ autoError }}</div>
    </div>
    <div v-if="historyOpen && backupToken && !busy">
      <div class="text" v-if="!files.length">{{ i18n.drive_no_backups }}</div>
      <div v-for="file in files" :key="file.id">
        <a-button @click="selectBackup(file)">
          {{ formatDate(file.modifiedTime) }}
        </a-button>
        <div class="text" style="overflow-wrap: break-word">{{ file.name }}</div>
      </div>
    </div>
    <div v-if="selectedFile && !busy">
      <div class="text">{{ selectedFile.name }}</div>
      <a-text-input
        :label="i18n.drive_backup_password"
        type="password"
        v-model="restorePassword"
        @enter="previewBackup()"
      />
      <a-button @click="previewBackup()">{{ i18n.drive_preview }}</a-button>
      <a-button @click="clearRestore()">{{ i18n.cancel }}</a-button>
    </div>
    <div v-if="previewReady && !busy">
      <div class="text">{{ i18n.drive_restore_new }}: {{ preview.length }}</div>
      <div class="text">{{ i18n.drive_restore_skip }}: {{ skipped }}</div>
      <div class="text" v-for="entry in preview" :key="entry.hash">
        {{ entry.issuer }} {{ entry.account }}
      </div>
      <div class="text warning" v-if="!encryption.getEncryptionStatus()">
        {{ i18n.drive_restore_require_password }}
      </div>
      <a-button v-if="!encryption.getEncryptionStatus()" @click="setLocalPassword()">
        {{ i18n.security }}
      </a-button>
      <a-button
        v-if="preview.length && encryption.getEncryptionStatus()"
        @click="restoreBackup()"
      >
        {{ i18n.drive_restore_confirm }}
      </a-button>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { isChrome } from "../../browser";
import { Drive, DriveBackupFile } from "../../models/backup";
import { decodeCloudBackup, planCloudRestore } from "../../models/backup-data";
import { EntryStorage } from "../../models/storage";
import { Encryption } from "../../models/encryption";
import { UserSettings } from "../../models/settings";

const service = "drive";

export default Vue.extend({
  data() {
    return {
      email: "",
      errorMessage: "",
      busy: false,
      files: [] as DriveBackupFile[],
      historyOpen: false,
      selectedFile: null as DriveBackupFile | null,
      restorePassword: "",
      preview: [] as { hash: string; issuer?: string; account?: string }[],
      skipped: 0,
      previewReady: false,
      restoreData: null as { [hash: string]: OTPStorage } | null,
      autoBackup: false,
      lastBackup: "",
      autoError: "",
    };
  },
  created() {
    chrome.runtime.onMessage.addListener(this.onAuthMessage);
  },
  beforeDestroy() {
    chrome.runtime.onMessage.removeListener(this.onAuthMessage);
    this.clearRestore();
  },
  watch: {
    visible(value: boolean) {
      if (!value) {
        this.clearRestore();
        this.historyOpen = false;
      }
    },
  },
  computed: {
    visible(): boolean {
      const style = this.$store.state.style.style;
      return style.fadein || style.show;
    },
    encryption() {
      return this.$store.state.accounts.encryption;
    },
    configured(): boolean {
      const manifest = chrome.runtime.getManifest() as {
        oauth2?: { client_id?: string };
      };
      return !isChrome || Boolean(manifest.oauth2?.client_id);
    },
    backupToken(): boolean {
      return this.$store.state.backup.driveToken;
    },
    retryLabel(): string {
      const language = chrome.i18n.getUILanguage();
      return language.startsWith("zh") ? "重试" : "Retry";
    },
  },
  methods: {
    showError(error: unknown) {
      this.errorMessage =
        error instanceof Error ? error.message : String(error);
      if (UserSettings.items.driveRevoked) {
        this.$store.commit("backup/setToken", { service, value: false });
        this.email = "";
      }
    },
    async onAuthMessage(message: { action: string; value?: string }) {
      if (message.action === "driveautherror") {
        this.busy = false;
        this.showError(message.value || "Google authorization failed");
      } else if (message.action === "drivetoken") {
        this.$store.commit("backup/setToken", { service, value: true });
        this.busy = false;
        await this.loadUser();
      }
    },
    getBackupToken() {
      this.errorMessage = "";
      chrome.runtime.sendMessage({ action: service });
    },
    formatDate(value: string): string {
      return new Date(value).toLocaleString();
    },
    clearRestore() {
      this.selectedFile = null;
      this.restorePassword = "";
      this.preview = [];
      this.skipped = 0;
      this.previewReady = false;
      this.restoreData = null;
    },
    setLocalPassword() {
      this.clearRestore();
      this.$store.commit("currentView/changeView", "SetPasswordPage");
    },
    async readLocalEntries(): Promise<{ [hash: string]: OTPStorage }> {
      const encryption = this.encryption as Encryption;
      const entries = await EntryStorage.get();
      for (const entry of entries) {
        if (encryption.getEncryptionStatus()) {
          entry.applyEncryption(encryption);
        }
        if (!entry.secret) {
          throw new Error("Unlock all local accounts before restoring");
        }
      }
      const data = EntryStorage.getExport(entries);
      if (data instanceof Error) {
        throw data;
      }
      if (!data || typeof data !== "object") {
        throw new Error("Unable to read local accounts");
      }
      return data as { [hash: string]: OTPStorage };
    },
    async loadBackups() {
      if (this.busy) {
        return;
      }
      this.busy = true;
      this.errorMessage = "";
      this.clearRestore();
      try {
        this.files = await new Drive().listBackups();
        this.historyOpen = true;
      } catch (error) {
        this.showError(error);
      } finally {
        this.busy = false;
      }
    },
    selectBackup(file: DriveBackupFile) {
      this.clearRestore();
      this.selectedFile = file;
      this.errorMessage = "";
      this.historyOpen = false;
    },
    async previewBackup() {
      if (!this.selectedFile || this.busy) {
        return;
      }
      this.busy = true;
      this.errorMessage = "";
      this.preview = [];
      this.previewReady = false;
      this.restoreData = null;
      try {
        const raw = await new Drive().downloadBackup(this.selectedFile.id);
        const data = decodeCloudBackup(raw, this.restorePassword);
        const local = await this.readLocalEntries();
        const plan = planCloudRestore(data, local);
        if (!this.visible) {
          return;
        }
        this.restoreData = data;
        this.preview = Object.keys(plan.additions).map((hash) => ({
          hash,
          issuer: plan.additions[hash].issuer,
          account: plan.additions[hash].account,
        }));
        this.skipped = plan.skipped;
        this.previewReady = true;
      } catch (error) {
        this.showError(error);
      } finally {
        this.restorePassword = "";
        this.busy = false;
      }
    },
    async restoreBackup() {
      if (
        !this.restoreData ||
        !this.previewReady ||
        this.busy ||
        !this.encryption.getEncryptionStatus()
      ) {
        return;
      }
      this.busy = true;
      this.errorMessage = "";
      try {
        const incoming = this.restoreData;
        // Re-read immediately before committing; don't overwrite local changes.
        const local = await this.readLocalEntries();
        if (!this.visible || !this.previewReady || this.restoreData !== incoming) {
          return;
        }
        const plan = planCloudRestore(incoming, local);
        const confirmed = new Set(this.preview.map((item) => item.hash));
        for (const hash of Object.keys(plan.additions)) {
          if (!confirmed.has(hash)) {
            delete plan.additions[hash];
          }
        }
        const count = await EntryStorage.import(
          this.encryption as Encryption,
          plan.additions,
          true
        );
        await this.$store.dispatch("accounts/updateEntries");
        this.clearRestore();
        this.$store.commit(
          "notification/alert",
          this.i18n.drive_restore_done + ": " + count
        );
      } catch (error) {
        this.showError(error);
      } finally {
        this.busy = false;
      }
    },
    async readAutoBackup() {
      await UserSettings.updateItems();
      this.autoBackup = Boolean(UserSettings.items.driveAutoBackup);
      const time = UserSettings.items.driveLastBackupTime;
      this.lastBackup = time ? new Date(time).toLocaleString() : "";
      this.autoError = UserSettings.items.driveLastBackupError || "";
    },
    async saveAutoBackup() {
      const enabled = this.autoBackup;
      try {
        await UserSettings.updateItems();
        UserSettings.items.driveAutoBackup = enabled;
        if (!enabled) {
          UserSettings.items.driveLastBackupError = undefined;
        }
        await UserSettings.commitItems();
        await this.readAutoBackup();
      } catch (error) {
        this.showError(error);
      }
    },
    async loadUser() {
      if (this.busy) {
        return;
      }
      this.busy = true;
      this.email = this.i18n.loading;
      this.errorMessage = "";
      try {
        this.email = await new Drive().getUser();
      } catch (error) {
        this.email = "";
        this.showError(error);
      } finally {
        this.busy = false;
      }
    },
    async backupLogout() {
      if (this.busy) {
        return;
      }
      this.busy = true;
      this.errorMessage = "";
      try {
        await new Drive().logout();
        this.clearRestore();
        this.historyOpen = false;
        await this.readAutoBackup();
        this.$store.commit("backup/setToken", { service, value: false });
        this.email = "";
      } catch (error) {
        this.showError(error);
      } finally {
        this.busy = false;
      }
    },
    async backupUpload() {
      if (this.busy) {
        return;
      }
      this.busy = true;
      this.errorMessage = "";
      try {
        if (await new Drive().upload(this.$store.state.accounts.encryption)) {
          await this.readAutoBackup();
          this.$store.commit("notification/alert", this.i18n.updateSuccess);
        } else {
          this.errorMessage = this.i18n.updateFailure;
        }
      } catch (error) {
        this.showError(error);
      } finally {
        this.busy = false;
      }
    },
  },
  async mounted() {
    await UserSettings.updateItems();
    this.$store.commit("backup/setToken", {
      service,
      value: Boolean(UserSettings.items.driveToken),
    });
    await this.readAutoBackup();
    if (this.backupToken) {
      await this.loadUser();
    }
  },
});
</script>
