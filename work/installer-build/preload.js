const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('journey', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  exportSave: (state) => ipcRenderer.invoke('state:export', state),
  exportSaveAuto: (state) => ipcRenderer.invoke('state:export-auto', state),
  importLatest: () => ipcRenderer.invoke('state:import-latest'),
  importSave: () => ipcRenderer.invoke('state:import'),
  translateText: (payload) => ipcRenderer.invoke('translation:translate', payload),
  recognizeSpeech: (audio) => ipcRenderer.invoke('speech:recognize', audio),
  readAudioAsset: (fileName) => ipcRenderer.invoke('audio:read-asset', fileName),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  openLanguageSettings: () => ipcRenderer.invoke('app:open-language-settings'),
  openSoundSettings: () => ipcRenderer.invoke('app:open-sound-settings'),
  showCourseBrowser: (payload) => ipcRenderer.invoke('course:show', payload),
  setCourseBrowserBounds: (bounds) =>
    ipcRenderer.invoke('course:set-bounds', bounds),
  hideCourseBrowser: () => ipcRenderer.invoke('course:hide'),
  navigateCourse: (url) => ipcRenderer.invoke('course:navigate', url),
  searchCourse: (query) => ipcRenderer.invoke('course:search', query),
  controlCourse: (action) => ipcRenderer.invoke('course:control', action),
  getCourseState: () => ipcRenderer.invoke('course:get-state'),
  captureCoursePosition: () => ipcRenderer.invoke('course:capture-position'),
  chooseLocalCourseFiles: () =>
    ipcRenderer.invoke('course:choose-local-files'),
  openLocalCourseFile: (filePath) =>
    ipcRenderer.invoke('course:open-local', filePath),
  openCourseExternal: (url) =>
    ipcRenderer.invoke('course:open-external', url),
  onCourseState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('course:state', listener);
    return () => ipcRenderer.removeListener('course:state', listener);
  },
});
