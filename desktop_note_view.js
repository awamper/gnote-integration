const St = imports.gi.St;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Shell = imports.gi.Shell;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const NoteContentView = Me.imports.note_content_view;
const Shared = Me.imports.shared;

const CONNECTION_IDS = {
    CONTENT_SIZE: 0
};

const DesktopNoteView = new Lang.Class({
    Name: 'DesktopNoteView',
    Extends: NoteContentView.NoteContentView,

    _init: function(container) {
        let params = {
            actor_style: 'desktop-note-view-box',
            content_style: 'desktop-note-view-content',
            scroll_style: '',
            content_size: Utils.SETTINGS.get_int(
                PrefsKeys.DESKTOP_NOTE_CONTENT_SIZE_KEY
            ),
            change_cursor_on_links: false
        };
        this.parent(params);

        this.actor.connect('button-press-event',
            Lang.bind(this, function(o, e) {
                if(Utils.is_double_click_event(e)) {
                    this._open_note();
                    return true;
                }

                return false;
            })
        );

        this.contents_label.connect('captured-event',
            Lang.bind(this, this._on_captured_event)
        );

        CONNECTION_IDS.CONTENT_SIZE = Utils.SETTINGS.connect(
            'changed::' + PrefsKeys.DESKTOP_NOTE_CONTENT_SIZE_KEY,
            Lang.bind(this, function() {
                this.content_size = Utils.SETTINGS.get_int(
                    PrefsKeys.DESKTOP_NOTE_CONTENT_SIZE_KEY
                );
            })
        );

        this._container = container;
        this.set_note(this._container.note);
    },

    _on_captured_event: function(o, e) {
        if(e.type() === Clutter.EventType.BUTTON_PRESS) {
            if(Utils.is_double_click_event(e)) {
                this._open_note();
                return false;
            }
            else if(this._container.is_modal) {
                return false;
            }
            else {
                this._push_modal();
                return false;
            }
        }
        else if(e.type() === Clutter.EventType.LEAVE) {
            this.contents_label.clutter_text.set_selection(0, 0);
            this.contents_label.clutter_text.set_editable(false);
            this._pop_modal();

            return false;
        }
        else if(e.type() === Clutter.EventType.KEY_PRESS) {
            if(e.has_control_modifier()) return false;

            let symbol = e.get_key_symbol();
            let ch = Utils.get_unichar(symbol);
            let backspace = symbol === Clutter.BackSpace;
            let enter = symbol == Clutter.Return || symbol == Clutter.KP_Enter;

            if(ch || backspace || enter) return true;
            else return false;
        }
        else {
            return false;
        }
    },

    _push_modal: function() {
        if(this._container.is_modal) return;

        this.contents_label.clutter_text.set_editable(true);
        let result = Main.pushModal(this._container.actor, {
            keybindingMode: Shell.KeyBindingMode.NORMAL
        });

        if(result) this._container.is_modal = true;
    },

    _pop_modal: function() {
        if(this._container.is_modal) {
            Main.popModal(this._container.actor);
            this._container.is_modal = false;
        }
    },

    _open_note: function() {
        this._pop_modal();
        Shared.desktop_notes.hide_modal();
        Utils.get_client().display_note(this._container.note.uri);
    },

    set_selection: function(start, end) {
        this.contents_label.clutter_text.set_selection(start, end);
    },

    set_background: function(clutter_color) {
        this.actor.set_background_color(clutter_color)
    },

    destroy: function() {
        if(CONNECTION_IDS.CONTENT_SIZE !== 0) {
            Utils.SETTINGS.disconnect(CONNECTION_IDS.CONTENT_SIZE);
            CONNECTION_IDS.CONTENT_SIZE = 0;
        }

        this.parent();
    },
});
