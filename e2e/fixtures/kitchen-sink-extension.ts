/**
 * Kitchen Sink Test Extension — exercises every feature of the conductor-extension-sdk.
 *
 * Defined as a manifest + raw CommonJS JS string so it can be injected into
 * the mocked electronAPI.readFile without needing a real build step.
 */

export const KITCHEN_SINK_MANIFEST = {
  id: 'kitchen-sink-test',
  name: 'Kitchen Sink Test',
  version: '1.0.0',
  main: 'index.js',
}

/**
 * Returns the CommonJS bundle source for the kitchen sink extension.
 * Uses React.createElement (no JSX) since this is raw JS evaluated at runtime.
 */
export function buildKitchenSinkBundle(): string {
  return `
var React = require('react');
var lucide = require('lucide-react');
var api = require('@conductor/extension-api');

var Beaker = lucide.Beaker;
var h = React.createElement;

// Track lifecycle calls for test assertions
window.__kitchenSinkActivated__ = 0;

// ── Sidebar ────────────────────────────────────────────────────────────────
function KitchenSinkSidebar(props) {
  return h('div', { 'data-testid': 'ks-sidebar' },
    h('h2', null, 'Kitchen Sink Sidebar'),
    h('span', { 'data-testid': 'ks-sidebar-group' }, 'Group: ' + props.groupId),
    h(api.ui.Button, { 'data-testid': 'ks-button', size: 'sm' }, 'SDK Button'),
    h(api.ui.Badge, { 'data-testid': 'ks-badge' }, 'SDK Badge')
  );
}

// ── Tab ────────────────────────────────────────────────────────────────────
function KitchenSinkTab(props) {
  return h('div', { 'data-testid': 'ks-tab-content' },
    h('h2', null, 'Kitchen Sink Tab'),
    h('span', { 'data-testid': 'ks-tab-id' }, 'Tab: ' + props.tabId),
    h('span', { 'data-testid': 'ks-tab-active' }, 'Active: ' + String(props.isActive)),
    h('span', { 'data-testid': 'ks-tab-title' }, 'Title: ' + (props.tab && props.tab.title || ''))
  );
}

// ── Settings panel ─────────────────────────────────────────────────────────
function KitchenSinkSettings() {
  return h('div', { 'data-testid': 'ks-settings' },
    h('h2', null, 'Kitchen Sink Settings'),
    h('p', null, 'Test settings panel content')
  );
}

// ── Extension definition ───────────────────────────────────────────────────
module.exports = {
  id: 'kitchen-sink-test',
  name: 'Kitchen Sink Test',
  description: 'Test extension exercising all SDK features',
  version: '1.0.0',
  icon: Beaker,

  sidebar: KitchenSinkSidebar,
  settingsPanel: KitchenSinkSettings,

  tabs: [{
    type: 'kitchen-sink',
    label: 'Kitchen Sink',
    icon: Beaker,
    component: KitchenSinkTab,
    fileExtensions: ['.ks', '.kitchensink'],
  }],

  newTabMenuItems: [{
    label: 'Kitchen Sink',
    icon: Beaker,
    action: function(groupId) {
      api.useTabsStore.getState().addTab(groupId, {
        type: 'kitchen-sink',
        title: 'Kitchen Sink',
      });
    },
  }],

  onActivate: function() {
    window.__kitchenSinkActivated__++;

    // Register a session info provider to exercise the registry
    if (api.useSessionInfoRegistry) {
      api.useSessionInfoRegistry.getState().register({
        id: 'kitchen-sink-info',
        order: 200,
        render: function(ctx) {
          return React.createElement('span', { 'data-testid': 'ks-session-info' },
            'KS: ' + ctx.sessionName
          );
        },
      });
    }
  },
};
`
}
