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
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { isChrome } from "../../browser";
import { Drive } from "../../models/backup";
import { UserSettings } from "../../models/settings";

const service = "drive";

export default Vue.extend({
  data() {
    return {
      email: "",
      errorMessage: "",
      busy: false,
    };
  },
  created() {
    chrome.runtime.onMessage.addListener(this.onAuthMessage);
  },
  beforeDestroy() {
    chrome.runtime.onMessage.removeListener(this.onAuthMessage);
  },
  computed: {
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
    if (this.backupToken) {
      await this.loadUser();
    }
  },
});
</script>
