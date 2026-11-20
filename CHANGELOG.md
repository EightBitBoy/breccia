# Changelog

User-visible changes to Breccia, newest first.

## [1.8.2] - 2026-11-20

### Features

- Dailies: emptying a daily's text asks to delete it
- Dailies: a drag handle shows beside a daily while the pointer is over it
- Links: a web address shows its full address on hover, and its menu can copy it

### Fixes

- Log: a Git password with an apostrophe no longer shows in the log
- Dailies: a daily is not deleted when lines were added under it while asking
- Dailies: right-clicking while editing a daily shows the text menu with Copy and Paste
- Settings: typing the default into a number field fixes a wrong value in the settings file

## [1.8.1] - 2026-11-19

### Features

- Dailies: ticked dailies are hidden in a Done section that opens with a click
- Dailies: a + beside the title opens the field to add a daily, which no longer stays on screen

## [1.8.0] - 2026-11-18

### Features

- Dailies: a list of things to tick each day, which starts afresh daily
- Status bar: the number of dailies still open; a click opens them
- Settings: choose the time your dailies start afresh

### Fixes

- Settings: a comment above a changed setting is no longer dropped

## [1.7.1] - 2026-11-17

### Fixes

- Log: a Git password with a slash or a question mark no longer shows in the log
- Log: the log is kept when it cannot be moved aside at its size limit
- Changelog: a link without text shows its web address
- Page colors: pressing on a slider's knob no longer nudges the color
- Editor: joining a block onto a task keeps its created and done lines intact
- Editor: after Ctrl Shift K the caret stops before the created line of a task above
- Editor: a block that can't be joined onto a task says why

## [1.7.0] - 2026-11-17

### Features

- Tags: typing # lists only existing tags, not every page
- Tags: the # menu shows each tag with its #, as it is written
- Settings: the web address options sit one above the other, without the note
- Links: web addresses can be shown without a trailing slash, set in Settings

## [1.6.0] - 2026-11-13

### Features

- Links: web addresses can be shown without https:// and cut short, set in Settings

## [1.5.2] - 2026-11-13

### Features

- Boards: dragging a card near the window edge scrolls the board sideways
- Boards: open cards show the day the task was created

### Fixes

- Editor: an email address in angle brackets now shows as a mail link
- Editor: a pasted bullet list that cannot be inserted now says so
- Sidebar: an older page list no longer replaces a newer one, and a refused drop refreshes it
- Editor: keys typed right after Ctrl Enter are kept and land in the block's text
- Search: a repair that cannot delete the damaged index names the real problem
- Settings: a config file caught half written is read again before it is called broken
- Editor: Keep mine no longer brings back text that an undo or a state change replaced
- Editor: a hidden byte-order mark at the start of pasted text is dropped

## [1.5.1] - 2026-11-12

### Features

- Settings: read the changelog inside the app, also offline
- Themes: Oxblood, a dark red theme

### Fixes

- Settings: a hand-edited number out of range gives a notice and uses the default

## [1.5.0] - 2026-11-11

### Features

- Themes: light themes come first in the menu and in Settings
- Themes: Vampire, a dark theme with pink and red accents
- Themes: Fjord, a dark theme in cool arctic blue-grey
- Themes: Ember, a dark theme in warm brown with orange accents
- Themes: Parchment, a light cream theme with blue accents
- Status bar: the mouse wheel over the theme button switches the theme

### Fixes

- Deleting every selected block keeps one empty block to write in
- Teal theme: selected and highlighted text is easier to read
- Teal theme: selected text shows its highlight while editing
- A page file saved with an upper-case .MD extension is reported at once, not only on reopen

## [1.4.0] - 2026-11-10

### Features

- Breccia writes its warnings and errors to a log file
- Settings: "Open log folder" opens the folder with Breccia's log
- Slash menu: a "Yesterday" entry, and "Today's date" is now "Today"
- Slash menu: the date entries show a small calendar
- Editor: Ctrl Shift K deletes the whole block with its sub-blocks

### Fixes

- Undo: typing during which the page list opened is undone in one step
- After an internal error Breccia reloads your notes and keeps saving
- Starting Breccia again shows the open window instead of a second copy
- Page colors: no faint lines between the rows of a wash when zoomed in

## [1.3.0] - 2026-11-09

### Features

- Themes: a button in the status bar changes the theme without opening Settings

### Fixes

- Page colors: the preview no longer keeps a color the pointer has left
- Page colors: the slider thumbs stay inside their tracks
- Page colors: screen readers hear when a slider stands on the page's color
- Journal: a right-click beside selected text no longer opens the browser menu
- Page colors: after a color pick from a journal link, the focus returns to the link
- Page colors: the picker stays at its link when the journal day changes
- Journal: a jump highlight on a colored row fades back to its color
- Journal: a selected row keeps the rounded ends of its color band
- Boards: the buttons on a hovered card have their own background color

## [1.2.0] - 2026-11-09

### Features

- Page colors: a vividness slider makes a custom color softer or stronger

## [1.1.1] - 2026-11-09

### Features

- Slash menu: states show as colored chips like on a page
- Slash menu: pick any day with Date…, and Current time is gone
- Settings: choose whether Journals sits at the top, bottom or among the folders in the sidebar
- Git settings: the "Now:" status line is gone

## [1.1.0] - 2026-11-07

### Features

- Settings: the About section links to the source code on GitHub
- Journal: blocks are shown on a soft wash of their topic page's color
- Pages: a color swatch beside the title picks one of 25 page colors
- Journal: right-click a link or tag to give its page a color
- Page colors: the color picker previews text, links and tags on each color
- Page colors: pick any hue with a slider, besides the 25 fixed colors

### Fixes

- Page colors: Escape in the color picker no longer clears selected blocks
- Page colors: screen readers announce the color picker by name

## [1.0.0] - 2026-11-06

First public release.

