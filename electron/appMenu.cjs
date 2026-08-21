const CHECK_LABEL = 'Check for Updates…';

function checkForUpdatesItem(onCheckForUpdates) {
  return {
    label: CHECK_LABEL,
    click: () => {
      void onCheckForUpdates();
    },
  };
}

/**
 * Application menu template. On macOS, Check for Updates sits in the SpeakFiction
 * menu (after About). On Windows, it lives under Help.
 */
function buildAppMenuTemplate({ platform, appName, onCheckForUpdates }) {
  const isMac = platform === 'darwin';
  const checkItem = checkForUpdatesItem(onCheckForUpdates);
  const macAppMenu = {
    label: appName || 'SpeakFiction',
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      checkItem,
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  };

  return [
    ...(isMac ? [macAppMenu] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: isMac ? [] : [checkItem],
    },
  ];
}

function installAppMenu(onCheckForUpdates) {
  const { app, Menu } = require('electron');
  const template = buildAppMenuTemplate({
    platform: process.platform,
    appName: app.getName() || 'SpeakFiction',
    onCheckForUpdates,
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { CHECK_LABEL, buildAppMenuTemplate, installAppMenu };
