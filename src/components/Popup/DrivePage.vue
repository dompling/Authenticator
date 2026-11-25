<template>
  <div>
    <div>
      <div class="text warning" v-if="!configured">
        {{ i18n.drive_not_configured }}
      </div>
      <div class="text warning" v-if="!encryption.getEncryptionStatus()">
        {{ i18n.drive_require_password }}
      </div>
      <div v-show="backupToken">
        <div style="margin: 10px 0px 0px 20px; overflow-wrap: break-word">
          {{ i18n.account }} - {{ email }}
        </div>
      </div>
      <a-button v-show="backupToken" @click="backupLogout()">
        {{ i18n.log_out }}
      </a-button>
      <a-button v-if="configured && !backupToken" @click="getBackupToken()">
        {{ i18n.sign_in }}
      </a-button>
      <a-button
        v-if="configured && backupToken && encryption.getEncryptionStatus()"
        @click="backupUpload()"
      >
        {{ i18n.manual_dropbox }}
      </a-button>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { isChrome } from "../../browser";
import { Drive } from "../../models/backup";
import { UserSettings } from "../../models/settings";

const service = "drive";

export default Vue.extend({
  data: function () {
    return {
      email: this.i18n.loading,
    };
  },
  created() {
    UserSettings.updateItems();
    chrome.runtime.onMessage.addListener(this.onAuthMessage);
  },
  beforeDestroy() {
    chrome.runtime.onMessage.removeListener(this.onAuthMessage);
  },
  computed: {
    encryption: function () {
      return this.$store.state.accounts.encryption;
    },
    configured(): boolean {
      const manifest = chrome.runtime.getManifest() as {
        oauth2?: { client_id?: string };
      };
      return !isChrome || Boolean(manifest.oauth2?.client_id);
    },
    backupToken: function () {
      return this.$store.state.backup.driveToken;
    },
  },
  methods: {
    onAuthMessage(message: { action: string; value?: string }) {
      if (message.action === "driveautherror") {
        this.$store.commit("notification/alert", message.value);
      } else if (message.action === "drivetoken") {
        this.$store.commit("backup/setToken", { service, value: true });
        this.getUser().then((email) => {
          this.email = email;
        });
      }
    },
    getBackupToken() {
      chrome.runtime.sendMessage({ action: service });
    },
    async backupLogout() {
      await new Promise((resolve: (value: boolean) => void) => {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "POST",
          "https://accounts.google.com/o/oauth2/revoke?token=" +
            UserSettings.items.driveToken
        );
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            if (isChrome) {
              chrome.identity.removeCachedAuthToken(
                { token: UserSettings.items.driveToken as string },
                () => {
                  resolve(true);
                }
              );
            } else {
              resolve(true);
            }
            return;
          }
        };
        xhr.send();
      });
      UserSettings.removeItem("driveToken");
      this.$store.commit("backup/setToken", { service, value: false });
      this.$store.commit("style/hideInfo");
    },
    async backupUpload() {
      const drive = new Drive();
      const response = await drive.upload(
        this.$store.state.accounts.encryption
      );
      if (response === true) {
        this.$store.commit("notification/alert", this.i18n.updateSuccess);
      } else if (UserSettings.items.driveRevoked === true) {
        this.$store.commit(
          "notification/alert",
          chrome.i18n.getMessage("token_revoked", ["Google Drive"])
        );
        UserSettings.removeItem("driveRevoked");
        this.$store.commit("backup/setToken", { service, value: false });
      } else {
        this.$store.commit("notification/alert", this.i18n.updateFailure);
      }
    },
    async getUser() {
      const drive = new Drive();
      return await drive.getUser();
    },
  },
  mounted: async function () {
    if (this.backupToken) {
      this.email = await this.getUser();
    }
  },
});
</script>
