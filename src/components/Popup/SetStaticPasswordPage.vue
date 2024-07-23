<template>
  <div>
    <div class="text warning">{{ i18n.security_warning }}</div>
    <a-text-input label="静态密码" type="text" v-model="staticPassword" />
    <div>
      <a-button id="security-save" @click="changePassphrase()">
        {{ i18n.ok }}
      </a-button>
      <a-button id="security-remove" @click="removePassphrase()">
        {{ i18n.remove }}
      </a-button>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";

export default Vue.extend({
  data: function () {
    return {
      staticPassword: this.$store.state.accounts.staticPassword || "",
    };
  },
  methods: {
    async removePassphrase() {
      this.$store.commit("currentView/changeView", "LoadingPage");
      this.$store.commit("accounts/setStaticPasswrod", "");
      this.$store.commit("notification/alert", this.i18n.updateSuccess);
      this.$store.commit("style/hideInfo");
      return;
    },
    async changePassphrase() {
      if (this.staticPassword === "") {
        return;
      }

      this.$store.commit("currentView/changeView", "LoadingPage");
      this.$store.commit("accounts/setStaticPasswrod", this.staticPassword);
      this.$store.commit("notification/alert", this.i18n.updateSuccess);
      this.$store.commit("style/hideInfo");
      return;
    },
  },
});
</script>
