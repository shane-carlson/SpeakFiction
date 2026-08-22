const CHECK_LABEL = 'Check for Updates…';
const REPORT_PROBLEM_LABEL = 'Report a problem…';
const REQUEST_FEATURE_LABEL = 'Request a feature…';

function noop() {}

function checkForUpdatesItem(onCheckForUpdates) {
  return {
    label: CHECK_LABEL,
    click: () => {
      void onCheckForUpdates();
    },
  };
}

function helpTicketItems(onReportProblem, onRequestFeature) {
  return [
    {
      label: REPORT_PROBLEM_LABEL,
      click: () => {
        void onReportProblem();
      },
    },
    {
      label: REQUEST_FEATURE_LABEL,
      click: () => {
        void onRequestFeature();
      },
    },
  ];
}

/**
 * Application menu template. On macOS, Check for Updates sits in the SpeakFiction
 * menu (after About). On Windows, it lives under Help.
 */
function buildAppMenuTemplate({
  platform,
  appName,
  onCheckForUpdates,
  onReportProblem,
  onRequestFeature,
}) {
  const isMac = platform === 'darwin';
  const checkItem = checkForUpdatesItem(onCheckForUpdates || noop);
  const ticketItems = helpTicketItems(onReportProblem || noop, onRequestFeature || noop);
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
      submenu: isMac ? ticketItems : [checkItem, { type: 'separator' }, ...ticketItems],
    },
  ];
}

function installAppMenu(options) {
  const { app, Menu } = require('electron');
  const opts = typeof options === 'function' ? { onCheckForUpdates: options } : options || {};
  const template = buildAppMenuTemplate({
    platform: process.platform,
    appName: app.getName() || 'SpeakFiction',
    onCheckForUpdates: opts.onCheckForUpdates,
    onReportProblem: opts.onReportProblem,
    onRequestFeature: opts.onRequestFeature,
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = {
  CHECK_LABEL,
  REPORT_PROBLEM_LABEL,
  REQUEST_FEATURE_LABEL,
  buildAppMenuTemplate,
  installAppMenu,
};
