<template>
  <div>
    <div v-if="entry">
      <div class="text">{{ entry.issuer }} {{ entry.account }}</div>
      <div class="text">{{ i18n.copy_prefix_help }}</div>
      <a-text-input
        :label="i18n.copy_prefix"
        type="password"
        v-model="prefix"
        @enter="savePrefix()"
      />
      <a-button @click="savePrefix()">{{ i18n.ok }}</a-button>
      <a-button @click="clearPrefix()">{{ i18n.remove }}</a-button>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { OTPEntry } from "../../models/otp";

export default Vue.extend({
  data() {
    const hash = this.$store.state.currentView.copyPrefixEntryHash;
    const entry = this.$store.state.accounts.entries.find(
      (item: OTPEntry) => item.hash === hash
    ) as OTPEntry | undefined;
    return { entry, prefix: entry?.copyPrefix || "", saving: false };
  },
  methods: {
    async savePrefix() {
      if (!this.entry || this.saving) {
        return;
      }
      const entry = this.entry;
      const oldPrefix = entry.copyPrefix;
      const oldEncryptedPrefix = entry.encCopyPrefix;
      this.saving = true;
      try {
        const encryption = this.$store.state.accounts.encryption;
        entry.setCopyPrefix(this.prefix, encryption);
        await entry.update();
      } catch (error) {
        entry.copyPrefix = oldPrefix;
        entry.encCopyPrefix = oldEncryptedPrefix;
        this.$store.commit("notification/alert", this.i18n.updateFailure);
        return;
      } finally {
        this.saving = false;
      }
      await this.$store.dispatch("accounts/refreshExports");
      this.$store.commit("notification/alert", this.i18n.updateSuccess);
      this.$store.commit("style/hideInfo");
      return;
    },
    async clearPrefix() {
      this.prefix = "";
      await this.savePrefix();
    },
  },
});
</script>
