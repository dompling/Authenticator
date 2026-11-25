export class CurrentView implements Module {
  getModule() {
    return {
      state: {
        info: "",
        copyPrefixEntryHash: "",
      },
      mutations: {
        setCopyPrefixEntry(
          state: { copyPrefixEntryHash: string },
          hash: string
        ) {
          state.copyPrefixEntryHash = hash;
        },
        changeView(state: { info: string }, viewName: string) {
          state.info = viewName;
        },
      },
      namespaced: true,
    };
  }
}
