## File Browser

- [ ] Color files the same way VS Code does. Research how VS Code implements file icon/color theming.
- [ ] Show the current directory between the header and the file tree.
- [ ] Right-click context menu should always have "New File" and "New Folder" options; remove those icons from the header.

## Tabs & Editor

- [ ] The unsaved file indicator in the tab should be a small star after the filename instead of the current large dot.
- [ ] Allow users to open/close the side preview when viewing a markdown file.

## Terminal

- [ ] Customize xterm.js to have a nice cursor like the Atom editor.
- [ ] Scrollback buffer
  - [ ] Implement an unlimited scrollback buffer using infinite scroll.
  - [ ] Store the full buffer to disk.
  - [ ] Lazy-load older content as the user scrolls up.
  - [ ] When the user scrolls back to the bottom, release older content from memory and revert to the default in-memory window.

## Notifications Extension (built-in)

- [ ] A notification sidebar that lists notifications.
- [ ] Notifications have a title, description, time, and source tab.
- [ ] Automatically add Claude Code hooks to push notifications.
- [ ] Clicking a notification opens or focuses the source tab.
- [ ] Allow users to enable/disable specific notifications in settings.
- [ ] Study cmux's notification-catching code and implement similarly.
- [ ] Add a ring/badge notification indicator on tabs (like cmux).

## Sessions & Claude Toolbar

- [ ] Give the sessions extension a description and version number.
- [ ] Fix the Claude toolbar showing "session" twice — change to "Claude ID:" and "Terminal ID:".
- [ ] Remove the "New Folder" button from the sessions sidebar (already in the right-click menu).

## Customization & Settings

- [ ] Add customization options for the terminal and editor (fonts, line spacing, colors, themes, etc.).
- [ ] Add customizable shortcut keys.

## Window & Layout

- [ ] Add a button on the far left of the title bar to collapse the sidebar.
- [ ] Before quitting, prompt to save any unsaved files.