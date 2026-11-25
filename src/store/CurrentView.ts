export class CurrentView implements Module {
  getModule() {
    return {
      state: {
        info: "",
        copyPrefixEntryHash: "",
        copyPrefixRevision: 0,
      },
      mutations: {
        setCopyPrefixEntry(
          state: { copyPrefixEntryHash: string; copyPrefixRevision: number },
          hash: string
        ) {
          state.copyPrefixEntryHash = hash;
          state.copyPrefixRevision++;
        },
        changeView(state: { info: string }, viewName: string) {
          state.info = viewName;
        },
      },
      namespaced: true,
    };
  }
}
