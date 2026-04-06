/**
 * Atlassian injection script — injected into atlassian.net pages to add
 * Conductor actions to Jira's "more actions" dropdown menu.
 *
 * Communication back to BrowserTab uses console.log with a JSON prefix
 * that the webview's `console-message` event handler can parse.
 */

// Prefix used to identify Conductor messages in console-message events
export const CONDUCTOR_MSG_PREFIX = '__conductor__:'

export type ConductorAction =
  | 'start-coding-in-tab'
  | 'start-coding-in-background'
  | 'open-in-claude'
  | 'open-in-vscode'

export interface ConductorMessage {
  action: ConductorAction
  ticketKey: string
}

/**
 * Returns true if the URL belongs to an Atlassian site where we should
 * inject the Conductor menu.
 */
export function isAtlassianUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname.endsWith('.atlassian.net')
  } catch {
    return false
  }
}

/**
 * Extracts a Jira ticket key from the current page URL.
 * Supports:
 *   /browse/CON-41
 *   /jira/software/projects/CON/...?selectedIssue=CON-41
 *   ?selectedIssue=CON-41 anywhere in the URL
 */
export function extractTicketKeyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)

    // /browse/CON-41
    const browseMatch = parsed.pathname.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/)
    if (browseMatch) return browseMatch[1]

    // ?selectedIssue=CON-41
    const selected = parsed.searchParams.get('selectedIssue')
    if (selected && /^[A-Z][A-Z0-9]+-\d+$/.test(selected)) return selected

    return null
  } catch {
    return null
  }
}

/**
 * Builds the JS string to inject into an atlassian.net webview.
 * The script uses MutationObserver to detect when Jira's dropdown menu
 * opens and appends Conductor actions.
 */
export function buildAtlassianInjectScript(): string {
  return `
(function() {
  if (window.__conductorInjected) return;
  window.__conductorInjected = true;

  var PREFIX = ${JSON.stringify(CONDUCTOR_MSG_PREFIX)};

  // Send a message back to BrowserTab via console.log with a known prefix
  function sendMessage(action, ticketKey) {
    console.log(PREFIX + JSON.stringify({ action: action, ticketKey: ticketKey }));
  }

  // Extract ticket key from the current URL
  function getTicketKey() {
    var url = window.location.href;

    // /browse/CON-41
    var browseMatch = url.match(/\\/browse\\/([A-Z][A-Z0-9]+-\\d+)/);
    if (browseMatch) return browseMatch[1];

    // ?selectedIssue=CON-41
    var params = new URLSearchParams(window.location.search);
    var selected = params.get('selectedIssue');
    if (selected && /^[A-Z][A-Z0-9]+-\\d+$/.test(selected)) return selected;

    return null;
  }

  // CSS for our injected menu items
  var style = document.createElement('style');
  style.textContent = [
    '.conductor-menu-group { border-top: 1px solid var(--ds-border, #091e4224); padding: 4px 0; }',
    '.conductor-menu-heading {',
    '  display: flex; align-items: center; gap: 6px;',
    '  padding: 4px 12px; font-size: 11px; font-weight: 600;',
    '  color: var(--ds-text-subtlest, #626f86); text-transform: uppercase;',
    '  letter-spacing: 0.04em; user-select: none;',
    '}',
    '.conductor-menu-heading svg { width: 14px; height: 14px; }',
    '.conductor-menu-item {',
    '  display: flex; align-items: center; gap: 8px;',
    '  padding: 6px 12px; font-size: 14px; cursor: pointer;',
    '  color: var(--ds-text, #172b4d);',
    '  transition: background 80ms;',
    '}',
    '.conductor-menu-item:hover {',
    '  background: var(--ds-background-neutral-subtle-hovered, #091e420f);',
    '}',
    '.conductor-menu-item svg { width: 16px; height: 16px; flex-shrink: 0; color: var(--ds-icon, #44546f); }',
  ].join('\\n');
  document.head.appendChild(style);

  // SVG icons (inline to avoid external deps)
  var ICONS = {
    conductor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    playBg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>',
    claude: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    vscode: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  };

  function createMenuItem(label, iconKey, action) {
    var item = document.createElement('div');
    item.className = 'conductor-menu-item';
    item.setAttribute('role', 'menuitem');
    item.setAttribute('tabindex', '-1');
    item.innerHTML = ICONS[iconKey] + '<span>' + label + '</span>';
    item.addEventListener('click', function(e) {
      e.stopPropagation();
      var key = getTicketKey();
      if (key) {
        sendMessage(action, key);
      }
      // Close the dropdown by clicking the document body
      document.body.click();
    });
    return item;
  }

  function injectConductorMenu(dropdown) {
    // Don't inject twice into the same dropdown
    if (dropdown.querySelector('.conductor-menu-group')) return;

    var ticketKey = getTicketKey();
    if (!ticketKey) return;

    var group = document.createElement('div');
    group.className = 'conductor-menu-group';

    var heading = document.createElement('div');
    heading.className = 'conductor-menu-heading';
    heading.innerHTML = ICONS.conductor + ' Conductor';
    group.appendChild(heading);

    group.appendChild(createMenuItem('Start coding in tab', 'play', 'start-coding-in-tab'));
    group.appendChild(createMenuItem('Start coding in background', 'playBg', 'start-coding-in-background'));
    group.appendChild(createMenuItem('Open in Claude', 'claude', 'open-in-claude'));
    group.appendChild(createMenuItem('Open in VSCode', 'vscode', 'open-in-vscode'));

    dropdown.appendChild(group);
  }

  // Jira renders dropdown menus into a portal/layer. We observe the entire
  // document for new popup elements that look like action menus.
  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var node = added[j];
        if (node.nodeType !== 1) continue;

        // Jira Cloud uses a popup layer with role="menu" or a section
        // containing menuitems. The "more actions" button (⋯) triggers
        // a dropdown with data-testid containing "action" or a role="menu".
        var menus = [];
        if (node.getAttribute && node.getAttribute('role') === 'menu') {
          menus.push(node);
        }
        // Also check for popup containers that contain role="menu" children
        if (node.querySelectorAll) {
          var nested = node.querySelectorAll('[role="menu"], [role="group"]');
          for (var k = 0; k < nested.length; k++) menus.push(nested[k]);
        }

        for (var m = 0; m < menus.length; m++) {
          // Only inject into menus that have menuitems (not navigation menus)
          var items = menus[m].querySelectorAll('[role="menuitem"]');
          if (items.length >= 2) {
            injectConductorMenu(menus[m]);
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  console.log('[Conductor] Atlassian injection active');
})();
`
}
