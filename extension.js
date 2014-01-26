const St = imports.gi.St;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Gio = imports.gi.Gio;
const Shell = imports.gi.Shell;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Panel = imports.ui.panel;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Clutter = imports.gi.Clutter;
const Tweener = imports.ui.tweener;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const GnoteIntegration = Me.imports.gnote_integration;
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const DesktopNotes = Me.imports.desktop_notes;
const Shared = Me.imports.shared;
const Tooltips = Me.imports.tooltips;

const SIGNAL_IDS = {
    ENABLE_SHORTCUTS: 0,
    ENABLE_DESKTOP_NOTES: 0,
    BUS_WATCHER: 0,
    APP: 0
};

const TIMEOUT_IDS = {
    WATCH_DBUS: 0
}

const ALLOWED_SESSION_MODES = ['user', 'classic'];

const GnoteEntryMenuItem = new Lang.Class({
    Name: 'GnoteEntryMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(params) {
        this.parent(params);

        this._hint_text = 'Name new note'

        let primary_icon = new St.Icon({
            icon_name: Utils.ICONS.CREATE_NOTE,
            icon_size: 20,
            reactive: false
        });
        this.entry = new St.Entry({
            hint_text: this._hint_text
        });
        this.entry.set_primary_icon(primary_icon);
        this.entry.clutter_text.connect('activate', Lang.bind(this, this.activate));
        this.addActor(this.entry);
    },

    _onButtonReleaseEvent: function(actor, event) {
        return true;
    },

    _onKeyFocusIn: function(actor) {
        return;
    },

    _onKeyFocusOut: function(actor) {
        return;
    },

    activate: function() {
        this.emit('activate', this.entry_text);
    },

    get entry_text() {
        return this.entry.text === this._hint_text ? '' : this.entry.text;
    }
});

const GnotePinnedNoteMenuItem = Lang.Class({
    Name: 'GnotePinnedNoteMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(uri, title) {
        this.parent();

        this.uri = uri;

        this.title = new St.Label({
            text: title || '...',
            reactive: true
        });
        this.title.clutter_text.set_max_length(70);

        this.icon = new St.Icon({
            icon_name: Utils.ICONS.PINNED,
            style_class: 'gnote-pinned-note-icon-active',
            reactive: true
        });
        this.icon.connect(
            'button-release-event',
            Lang.bind(this, function(o, e) {
                let button = e.get_button();

                if(button !== Clutter.BUTTON_PRIMARY) return false;

                this.emit('icon-clicked');
                return true;
            })
        );

        this.box = new St.BoxLayout();
        this.box.add_child(this.icon);
        this.box.add(this.title);
        this.addActor(this.box);
    },

    _onButtonReleaseEvent: function(actor, event) {
        this.emit('activate');
    }
});

const GnoteIntegrationButton = new Lang.Class({
    Name: 'GnoteIntegrationButton',
    Extends: PanelMenu.SystemStatusButton,

    _init: function() {
        this.parent(Utils.ICONS.INDICATOR);
        this._desktop_notes = null;
        this._gnote = new GnoteIntegration.GnoteIntegration();
        this._create_named_note_menu_item = null;
        this._create_note_from_clipboard_menu_item = null;

        this.menu.actor.connect(
            'key-press-event',
            Lang.bind(this, this._on_start_typing)
        );

        Shared.gnote_button = this;
        this._fill_menu();
    },

    _fill_menu: function() {
        this.menu.removeAll();
        let pinned_uris = Utils.get_client().get_pinned_notes_sync();

        if(pinned_uris.length < 1) {
            let no_pinned = new PopupMenu.PopupMenuItem('No pinned notes');
            this.menu.addMenuItem(no_pinned);
        }
        else {
            let pinned_titles = [];

            for each(let uri in pinned_uris) {
                if(Utils.is_blank(uri)) continue;

                let item = new GnotePinnedNoteMenuItem(uri);
                item.connect('activate',
                    Lang.bind(this, function(item) {
                        Utils.get_client().display_note(item.uri);
                    })
                );
                item.connect('icon-clicked',
                    Lang.bind(this, function(item) {
                        item.setActive(false);
                        Utils.get_client().unpin_note_sync(item.uri);
                        item.actor.set_pivot_point(0.5, 0.5);
                        Tweener.addTween(item.actor, {
                            time: 0.3,
                            transition: 'easeOutQuad',
                            translation_x: item.actor.x + 200,
                            opacity: 0,
                            onComplete: Lang.bind(this, function() {
                                item.destroy();
                            })
                        });
                    })
                );
                this.menu.addMenuItem(item);

                Utils.get_client().get_note_title(uri,
                    Lang.bind(this, function(title) {
                        if(title) {
                            item.title.set_text(title);
                        }
                        else {
                            item.title.set_text('error');
                        }
                    })
                );
            }
        }

        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this._create_named_note_menu_item = new GnoteEntryMenuItem({
            style_class: 'gnote-entry-menu-item'
        });
        this._create_named_note_menu_item.connect('activate',
            Lang.bind(this, function(object, note_name) {
                if(!note_name) return;
                this._create_new_note(note_name, null, true);
            })
        );
        this.menu.addMenuItem(separator);
        this.menu.addMenuItem(this._create_named_note_menu_item);

        let second_separator = new PopupMenu.PopupSeparatorMenuItem();
        this._create_note_from_clipboard_menu_item = new PopupMenu.PopupMenuItem('');
        this._create_note_from_clipboard_menu_item.label.clutter_text.set_use_markup(true);
        this._create_note_from_clipboard_menu_item.connect('activate',
            Lang.bind(this, function() {
                let clipboard = St.Clipboard.get_default();
                clipboard.get_text(St.ClipboardType.CLIPBOARD,
                    Lang.bind(this, function(clipboard, text) {
                        if(Utils.is_blank(text)) return;

                        let note_name = null;
                        let entry_text = this._create_named_note_menu_item.entry_text;
                        if(!Utils.is_blank(entry_text)) note_name = entry_text;
                        this._create_new_note(note_name, text, true);
                    })
                );
            })
        );
        let show_all_menu_item = new PopupMenu.PopupMenuItem('Show all notes');
        show_all_menu_item.connect('activate',
            Lang.bind(this, function() {
                Utils.get_client().display_search();
            })
        );
        let preferences_menu_item = new PopupMenu.PopupMenuItem('Preferences');
        preferences_menu_item.connect('activate',
            Lang.bind(this, function() {
                Utils.launch_extension_prefs(Me.uuid);
            })
        );
        this.menu.addMenuItem(second_separator);
        this.menu.addMenuItem(this._create_note_from_clipboard_menu_item);
        this.menu.addMenuItem(show_all_menu_item);
        this.menu.addMenuItem(preferences_menu_item);
    },

    _on_start_typing: function(o, e) {
        let symbol = e.get_key_symbol()
        let ch = Utils.get_unichar(symbol);

        if(ch && this._create_named_note_menu_item) {
            this._create_named_note_menu_item.entry.set_text(ch);
            this._create_named_note_menu_item.entry.grab_key_focus();
            return true;
        }
        else {
            return false;
        }
    },

    _onButtonPress: function(actor, event) {
        let button = event.get_button();
        Shared.desktop_notes.hide_modal();

        switch(button) {
            case Clutter.BUTTON_SECONDARY:
                this.menu.toggle();
                this._fill_menu();
                break;
            case Clutter.BUTTON_MIDDLE:
                break;
            default:
                this.menu.close(false);
                let disable_search_dialog = Utils.SETTINGS.get_boolean(
                    PrefsKeys.DISABLE_SEARCH_DIALOG_KEY
                );

                if(disable_search_dialog) {
                    Utils.get_client().display_search();
                }
                else {
                    this._gnote.toggle();
                }

                break;
        }

        return true;
    },

    _onSourceKeyPress: function(actor, event) {
        this._on_start_typing(actor, event);
        this.parent(actor, event);
        return true;
    },

    _onOpenStateChanged: function(menu, open) {
        this.parent(menu, open);

        if(open) {
            this._create_named_note_menu_item.entry.set_text('');
            let clipboard = St.Clipboard.get_default();
            clipboard.get_text(St.ClipboardType.CLIPBOARD,
                Lang.bind(this, function(clipboard, text) {
                    let text_length = 0;

                    if(!Utils.is_blank(text)) {
                        text_length = text.trim().length;
                    }

                    if(text_length < 1) {
                        this._create_note_from_clipboard_menu_item.setSensitive(false);
                        this._create_note_from_clipboard_menu_item.label.clutter_text.set_markup(
                            'New note from clipboard' +
                            '(<span size="xx-small" color="grey"><i>empty</i></span>)'
                        );
                    }
                    else {
                        this._create_note_from_clipboard_menu_item.setSensitive(true);
                        this._create_note_from_clipboard_menu_item.label.clutter_text.set_markup(
                            'New note from clipboard' +
                            '(<span size="xx-small" color="grey"><i>%s chars</i></span>)'
                            .format(text_length)
                        );
                    }
                })
            );
        }
    },

    _create_new_note: function(name, content, display) {
        function on_note_created(uri) {
            if(!uri) return;

            Utils.get_client().get_note_title(uri, Lang.bind(this, function(title) {
                if(content !== null) {
                    if(name === null) {
                        name = title
                    }

                    content = name + '\n\n' + content;
                    Utils.get_client().set_note_contents(uri, content);
                }
                if(display === true) {
                    Utils.get_client().display_note(uri);
                }
            }));
        }

        if(name !== null) {
            Utils.get_client().create_named_note(name, on_note_created)
        }
        else {
            Utils.get_client().create_note(on_note_created);
        }
    },

    enable_desktop_notes: function() {
        if(this._desktop_notes !== null) return;

        this._desktop_notes = DesktopNotes.get_desktop_notes();
        this._desktop_notes.enable();
    },

    disable_desktop_notes: function() {
        DesktopNotes.destroy_desktop_notes();
        this._desktop_notes = null;
    },

    add_keybindings: function() {
        Main.wm.addKeybinding(
            PrefsKeys.SHOW_DIALOG_SHORTCUT_KEY,
            Utils.SETTINGS,
            Meta.KeyBindingFlags.NONE,
            Shell.KeyBindingMode.NORMAL |
            Shell.KeyBindingMode.MESSAGE_TRAY |
            Shell.KeyBindingMode.OVERVIEW,
            Lang.bind(this, function() {
                this._gnote.toggle();
            })
        );
        Main.wm.addKeybinding(
            PrefsKeys.SHOW_MENU_SHORTCUT_KEY,
            Utils.SETTINGS,
            Meta.KeyBindingFlags.NONE,
            Shell.KeyBindingMode.NORMAL |
            Shell.KeyBindingMode.MESSAGE_TRAY |
            Shell.KeyBindingMode.OVERVIEW,
            Lang.bind(this, function() {
                this.menu.toggle();
            })
        );
    },

    remove_keybindings: function() {
        Main.wm.removeKeybinding(PrefsKeys.SHOW_DIALOG_SHORTCUT_KEY);
        Main.wm.removeKeybinding(PrefsKeys.SHOW_MENU_SHORTCUT_KEY);
    },

    destroy: function() {
        Shared.gnote_button = null;
        Tooltips.get_manager().destroy();
        this.remove_keybindings();
        this.disable_desktop_notes();
        this._gnote.destroy();
        this.parent();
    }
});

let gnote_button = null;

function show_button() {
    if(ALLOWED_SESSION_MODES.indexOf(Main.sessionMode.currentMode) === -1) return;

    if(gnote_button === null) {
        gnote_button = new GnoteIntegrationButton();
        Main.panel.addToStatusArea('gnote_integration', gnote_button)
    }

    if(Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_SHORTCUTS_KEY)) {
        gnote_button.add_keybindings();
    }

    SIGNAL_IDS.ENABLE_SHORTCUTS =
        Utils.SETTINGS.connect('changed::'+PrefsKeys.ENABLE_SHORTCUTS_KEY,
            Lang.bind(this, function() {
                let enable = Utils.SETTINGS.get_boolean(
                    PrefsKeys.ENABLE_SHORTCUTS_KEY
                );

                if(enable) gnote_button.add_keybindings();
                else gnote_button.remove_keybindings();
            })
        );

    if(Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_DESKTOP_NOTES_KEY)) {
        gnote_button.enable_desktop_notes();
    }

    SIGNAL_IDS.ENABLE_DESKTOP_NOTES =
        Utils.SETTINGS.connect('changed::'+PrefsKeys.ENABLE_DESKTOP_NOTES_KEY,
            Lang.bind(this, function() {
                let enable = Utils.SETTINGS.get_boolean(
                    PrefsKeys.ENABLE_DESKTOP_NOTES_KEY
                );

                if(enable) gnote_button.enable_desktop_notes();
                else gnote_button.disable_desktop_notes();
            })
        );
}

function hide_button() {
    if(SIGNAL_IDS.ENABLE_SHORTCUTS > 0) {
        Utils.SETTINGS.disconnect(SIGNAL_IDS.ENABLE_SHORTCUTS);
    }

    if(SIGNAL_IDS.ENABLE_DESKTOP_NOTES > 0) {
        Utils.SETTINGS.disconnect(SIGNAL_IDS.ENABLE_DESKTOP_NOTES);
    }

    if(gnote_button !== null) {
        gnote_button.destroy();
        gnote_button = null;
    }
}

function watch_dbus() {
    SIGNAL_IDS.BUS_WATCHER = Gio.bus_watch_name(
        Gio.BusType.SESSION,
        Utils.SETTINGS.get_string(PrefsKeys.DBUS_NAME_KEY),
        0,
        Lang.bind(this, function() {
            if(TIMEOUT_IDS.WATCH_DBUS > 0) {
                Mainloop.source_remove(TIMEOUT_IDS.WATCH_DBUS);
                TIMEOUT_IDS.WATCH_DBUS = 0;
            }

            let timeout = Utils.SETTINGS.get_int(
                PrefsKeys.WATCH_DBUS_TIMEOUT_SECONDS_KEY
            );

            if(timeout < 1) {
                show_button();
                return;
            }

            TIMEOUT_IDS.WATCH_DBUS = Mainloop.timeout_add_seconds(
                timeout,
                Lang.bind(this, function() {
                    show_button();
                    return false;
                })
            );
        }),
        Lang.bind(this, function() {
            hide_button();
        })
    );
}

function unwatch_dbus() {
    if(TIMEOUT_IDS.WATCH_DBUS > 0) {
        Mainloop.source_remove(TIMEOUT_IDS.WATCH_DBUS);
        TIMEOUT_IDS.WATCH_DBUS = 0;
    }

    if(SIGNAL_IDS.BUS_WATCHER > 0) {
        Gio.bus_unwatch_name(SIGNAL_IDS.BUS_WATCHER);
        SIGNAL_IDS.BUS_WATCHER = 0;
    }
}

function init(extension) {
    // nothing
}

function enable() {
    SIGNAL_IDS.APP = Utils.SETTINGS.connect(
        'changed::' + PrefsKeys.DBUS_NAME_KEY,
        Lang.bind(this, function() {
            unwatch_dbus();
            hide_button();
            Utils.get_client().destroy();
            watch_dbus();
        })
    );

    watch_dbus();
}

function disable() {
    if(SIGNAL_IDS.APP > 0) {
        Utils.SETTINGS.disconnect(SIGNAL_IDS.APP);
        SIGNAL_IDS.APP = 0;
    }

    unwatch_dbus();
    hide_button();
    Utils.SETTINGS.run_dispose();
}
