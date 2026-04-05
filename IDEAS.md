## File Browser

- [x] Color files the same way VS Code does. Research how VS Code implements file icon/color theming.
- [x] Show the current directory between the header and the file tree.
- [x] Right-click context menu should always have "New File" and "New Folder" options; remove those icons from the header.

## Tabs & Editor

- [x] The unsaved file indicator in the tab should be a small star after the filename instead of the current large dot.
- [x] Allow users to open/close the side preview when viewing a markdown file.

## Terminal

- [x] Customize xterm.js to have a nice cursor like the Atom editor.
- [x] Scrollback buffer
  - [x] Implement an unlimited scrollback buffer using infinite scroll.
  - [x] Store the full buffer to disk.
  - [x] Lazy-load older content as the user scrolls up.
  - [x] When the user scrolls back to the bottom, release older content from memory and revert to the default in-memory window.

## Notifications Extension (built-in)

- [x] A notification sidebar that lists notifications.
- [x] Notifications have a title, description, time, and source tab.
- [x] Automatically add Claude Code hooks to push notifications.
- [x] Clicking a notification opens or focuses the source tab.
- [x] Allow users to enable/disable specific notifications in settings.
- [x] Study cmux's notification-catching code and implement similarly.
- [x] Add a ring/badge notification indicator on tabs (like cmux).

## Sessions & Claude Toolbar

- [x] Give the sessions extension a description and version number.
- [x] Fix the Claude toolbar showing "session" twice — change to "Claude ID:" and "Terminal ID:".
- [x] Remove the "New Folder" button from the sessions sidebar (already in the right-click menu).

## Customization & Settings

- [x] Add customization options for the terminal and editor (fonts, line spacing, colors, themes, etc.).
- [x] Add customizable shortcut keys.

## Window & Layout

- [x] Add a button on the far left of the title bar to collapse the sidebar.
- [x] Before quitting, prompt to save any unsaved files.

## Claude Usage

- [x] Every X minutes, open a terminal (hidden -- not visible in the sidebar or in tabs). Run `claude "/usage"`. wait for "Esc to cancel", then scrape usage data then persist it so we can have that stat show in the footer status bar