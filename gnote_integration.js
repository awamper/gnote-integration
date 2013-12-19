const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Shell = imports.gi.Shell;
const Gio = imports.gi.Gio;
const Tweener = imports.ui.tweener;
const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;
const Panel = imports.ui.panel;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const Dialog = Me.imports.dialog;
const StatusBar = Me.imports.status_bar;
const PrefsKeys = Me.imports.prefs_keys;
const GnoteToolbar = Me.imports.gnote_toolbar;
const ListView = Me.imports.list_view;
const ListViewItemsCounter = Me.imports.list_view_items_counter;
// const GnoteListViewTitle = Me.imports.gnote_list_view_title;
const GnoteListViewSnippet = Me.imports.gnote_list_view_snippet;
const GnoteNoteView = Me.imports.gnote_note_view;
const DesktopNotes = Me.imports.desktop_notes;

const TIMEOUT_TIMES = {
    SEARCH: 400
};
const TIMEOUT_IDS = {
    SEARCH: 0
};

const GnoteIntegration = new Lang.Class({
    Name: "GnoteIntegration",
    Extends: Dialog.Dialog,

    _init: function() {
        let params = {
            width_percents: Utils.SETTINGS.get_int(PrefsKeys.WIDTH_PERCENTS_KEY),
            height_percents: Utils.SETTINGS.get_int(PrefsKeys.HEIGHT_PERCENTS_KEY),
            animation_time: 0.5,
            style_class: 'gnote-box'
        };

        this._statusbar = new StatusBar.StatusBar({
            style_class: 'gnote-statusbar-box'
        });

        this.parent(params);

        this._status_label = new St.Label({
            style_class: 'gnote-list-view-status-label',
            text: 'Empty',
            visible: false
        });

        Utils.get_client().connect('note-added',
            Lang.bind(this, function() {
                this._notes_changed_trigger = true;
            })
        );
        Utils.get_client().connect('note-deleted',
            Lang.bind(this, function() {
                this._notes_changed_trigger = true;
            })
        );
        Utils.get_client().connect('pinned-notes-changed',
            Lang.bind(this, function() {
                this._notes_changed_trigger = true;
            })
        );
        this._init_search_entry();
        this._list_view = new ListView.ListView();
        this._list_view.connect(
            "item-clicked",
            Lang.bind(this, this._on_item_clicked)
        );
        this._list_view.connect(
            "displayed-items-changed",
            Lang.bind(this, this._on_items_changed)
        );
        this._items_counter = new ListViewItemsCounter.ListViewItemsCounter(
            this._list_view
        );
        this._toolbar = new GnoteToolbar.GnoteToolbar(this);

        this._init_note_view();

        this.table.add(this._search_entry, {
            row: 0,
            col: 0,
            col_span: 3,
            x_fill: true,
            x_expand: true,
            y_fill: false,
            y_expand: false,
            y_align: St.Align.START,
            x_align: St.Align.START
        });
        this.table.add(this._list_view.actor, {
            row: 1,
            col: 0,
            col_span: 3,
            x_fill: true,
            y_fill: true,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });
        this.table.add(this._note_view.actor, {
            row: 0,
            row_span: 2,
            col: 0,
            col_span: 3,
            x_fill: true,
            x_expand: true,
            y_fill: false,
            y_expand: false,
            y_align: St.Align.START,
            x_align: St.Align.START
        });
        this.table.add(this._status_label, {
            row: 1,
            col: 0,
            col_span: 3,
            x_expand: true,
            y_expand: true,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });
        this.table.add(this._toolbar.actor, {
            row: 2,
            col: 2,
            x_fill: false,
            x_expand: false,
            y_fill: false,
            y_expand: false,
            y_align: St.Align.MIDDLE,
            x_align: St.Align.END
        });
        this.table.add(this._items_counter.actor, {
            row: 2,
            col: 0,
            x_fill: false,
            x_expand: false,
            y_fill: false,
            y_expand: false,
            y_align: St.Align.MIDDLE,
            x_align: St.Align.START
        });
        this.table.add(this._statusbar.actor, {
            row: 2,
            col: 1,
            x_fill: false,
            x_expand: false,
            y_fill: false,
            y_expand: false,
            y_align: St.Align.MIDDLE,
            x_align: St.Align.END
        });

        this._loading_message_id = 0;
        this._notes_changed_trigger = true;

        Utils.SETTINGS.connect(
            'changed::' + PrefsKeys.ENABLE_DESKTOP_NOTES_KEY,
            Lang.bind(this, function() {
                this._notes_changed_trigger = true;
            })
        );
        Utils.SETTINGS.connect(
            'changed::' + PrefsKeys.ENABLED_DESKTOP_NOTES_KEY,
            Lang.bind(this, function() {
                this._notes_changed_trigger = true;
            })
        );
    },

    _on_item_clicked: function(object, button, item) {
        switch(button) {
            case Clutter.BUTTON_SECONDARY:
                this.delete_item(item);
                break;
            case Clutter.BUTTON_MIDDLE:
                break;
            default:
                this.activate_item(item);
                break;
        }
    },

    _on_items_changed: function() {
        if(this._list_view.displayed_length > 0) {
            this._status_label.hide();
        }
        else {
            this._status_label.show();
        }
    },

    _init_note_view: function() {
        this._note_view = new GnoteNoteView.GnoteNoteView(this._list_view.actor);
        this._note_view.connect('url-clicked', Lang.bind(this, function(o, url) {
            if(url.indexOf(':') === -1) {
                url = 'http://' + url;
            }

            Gio.app_info_launch_default_for_uri(
                url,
                global.create_app_launch_context()
            );
            this.hide();
        }));
        this._note_view.connect('note-clicked', Lang.bind(this, function(o, title) {
            Utils.get_client().find_note(title, Lang.bind(this, function(result) {
                if(!result) return;

                this._note_view.load_note(result);
            }));
        }));
    },

    _init_search_entry: function() {
        this._search_entry = new St.Entry({
            style_class: "gnote-search-entry",
            hint_text: "Type to search",
            track_hover: true,
            can_focus: true
        });
        this._search_entry.connect('key-press-event',
            Lang.bind(this, this._on_search_key_press_event)
        );
        this._search_entry.clutter_text.connect('text-changed',
            Lang.bind(this, this._on_search_text_changed)
        );
        this._inactive_icon = new St.Icon({
            style_class: 'gnote-search-entry-icon',
            icon_name: Utils.ICONS.SEARCH_INACTIVE,
            reactive: false
        });
        this._active_icon = new St.Icon({
            style_class: 'gnote-search-entry-icon',
            icon_name: Utils.ICONS.SEARCH_ACTIVE,
            reactive: true
        });
        this._search_entry.set_secondary_icon(this._inactive_icon);
        this._search_entry.connect('secondary-icon-clicked',
            Lang.bind(this, function() {
                this._search_entry.set_text('');
            })
        );
    },

    _on_key_press_event: function(o, e) {
        let symbol = e.get_key_symbol()
        let ch = Utils.get_unichar(symbol);
        let selected_count = this._list_view.get_selected().length;

        if(symbol === Clutter.KEY_Control_L || symbol === Clutter.KEY_Control_R) {
            this._list_view.show_shortcuts();
            return false;
        }
        else if(e.has_control_modifier()) {
            let unichar = Utils.get_unichar(symbol);
            let number = parseInt(unichar);
            
            if(number !== NaN && number >= 1 && number <= 9) {
                this._activate_by_shortcut(number);
            }

            return false;
        }
        else if(symbol === Clutter.Escape) {
            this.hide();
            return true;
        }
        else if(symbol === Clutter.Up) {
            if(selected_count > 0) {
                this._list_view.select_previous();
            }
            else {
                this._list_view.select_first_visible();
            }

            return true;
        }
        else if(symbol === Clutter.Down) {
            if(selected_count > 0) {
                this._list_view.select_next();
            }
            else {
                this._list_view.select_first_visible();
            }

            return true;
        }
        else if(ch) {
            this._search_entry.set_text(ch);
            this._search_entry.grab_key_focus();
            return true;
        }
        else {
            return false;
        }
    },

    _on_key_release_event: function(o, e) {
        let symbol = e.get_key_symbol()

        if(symbol === Clutter.KEY_Control_L || symbol === Clutter.KEY_Control_R) {
            this._list_view.hide_shortcuts();

            return true;
        }
        else if(symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
            let selected = this._list_view.get_selected();

            if(selected.length === 1) {
                this.activate_item(selected[0]);
            }

            return true;
        }
        else if(symbol == Clutter.Delete) {
            let selected = this._list_view.get_selected();

            if(selected.length === 1) {
                this.delete_item(selected[0]);
            }

            return true;
        }
        else {
            return false;
        }
    },

    _is_empty_entry: function(entry) {
        if(Utils.is_blank(entry.text) || entry.text === entry.hint_text) {
            return true
        }
        else {
            return false;
        }
    },

    _on_search_key_press_event: function(o, e) {
        let symbol = e.get_key_symbol();
        let ctrl = (e.get_state() & Clutter.ModifierType.CONTROL_MASK)

        if(symbol === Clutter.Escape) {
            if(ctrl) {
                this.hide();
            }
            else {
                this._search_entry.set_text('');
                this.actor.grab_key_focus();
                this._list_view.clear();
                this._notes_changed_trigger = true;
                this._show_start_notes();
            }

            return true;
        }

        return false;
    },

    _on_search_text_changed: function() {
        if(TIMEOUT_IDS.SEARCH !== 0) {
            Mainloop.source_remove(TIMEOUT_IDS.SEARCH);
            TIMEOUT_IDS.SEARCH = 0;
        }

        if(!this._is_empty_entry(this._search_entry)) {
            this._search_entry.set_secondary_icon(this._active_icon);

            TIMEOUT_IDS.SEARCH = Mainloop.timeout_add(
                TIMEOUT_TIMES.SEARCH,
                Lang.bind(this, function() {
                    this._list_view.clear();
                    this._search_notes(this._search_entry.text);
                })
            );
        }
        else {
            if(this._search_entry.text === this._search_entry.hint_text) return;

            // this.actor.grab_key_focus();
            this._search_entry.set_secondary_icon(this._inactive_icon);
        }
    },

    _activate_by_shortcut: function(shortcut) {
        for(let i = 0; i < this._list_view.displayed_length; i++) {
            let item = this._list_view.displayed_items[i];

            if(item.shortcut === shortcut) {
                this.activate_item(item);
                break;
            }
        }
    },

    _show_notes: function(note_uris) {
        this._loading_message_id = this._statusbar.add_message({
            text: "Loading...",
            has_spinner: true
        });
        Mainloop.idle_add(Lang.bind(this, function() {
            let snippets = [];

            for(let i = 0; i < note_uris.length; i++) {
                let uri = note_uris[i];

                if(Utils.is_blank(uri)) continue;

                let snippet = new GnoteListViewSnippet.GnoteListViewSnippet(uri, this);
                snippets.push(snippet);
            }

            this._list_view.set_items(snippets);
            this._list_view.show_all();
            this._list_view.actor.vscroll.adjustment.value = 0;
            this._list_view.select_first();
            this._statusbar.remove_message(this._loading_message_id);
        }));
    },

    _show_all_notes: function() {
        Utils.get_client().list_all_notes(Lang.bind(this, function(uris, error) {
            if(!uris) {
                Main.notify("Gnote Integration", 'Can\'t connect to Gnote');
                return;
            }

            this._show_notes(uris);
        }));
    },

    _show_pined_notes: function() {
        let pinned_uris = Utils.get_client().get_pinned_notes_sync();
        this._show_notes(pinned_uris);
    },

    _show_start_notes: function() {
        if(!this._notes_changed_trigger) return;

        this._notes_changed_trigger = false;
        this._list_view.clear();

        let max_notes = Utils.SETTINGS.get_int(PrefsKeys.MAX_DISPLAYED_NOTES_KEY);
        let result_uris = Utils.get_client().get_pinned_notes_sync();

        if(result_uris.length >= max_notes) {
            result_uris = result_uris.slice(0, max_notes);
            this._show_notes(result_uris);
        }
        else {
            Utils.get_client().list_all_notes(
                Lang.bind(this, function(uris, error) {
                    if(!uris) {
                        Main.notify(
                            "Gnote Integration",
                            'Can\'t connect to Gnote'
                        );
                        return;
                    }

                    for(let index in uris) {
                        let uri = uris[index];
                        let exists = result_uris.indexOf(uri) !== -1;

                        if(!exists) {
                            result_uris.push(uri);
                        }

                        if(result_uris.length >= max_notes + 1) break;

                    }

                    this._show_notes(result_uris);
                })
            );
        }
    },

    _search_notes: function(term) {
        Utils.get_client().search_notes(term, false,
            Lang.bind(this, function(uris, error) {
                if(!uris) {
                    Main.notify("Gnote Integration", error);
                    return;
                }

                this._show_notes(uris.slice(0, Utils.SETTINGS.get_int(
                    PrefsKeys.MAX_DISPLAYED_NOTES_KEY
                )));
            })
        );
    },

    _show_note: function(uri) {
        this._note_view.load_note(uri);
        this._note_view.show();
    },

    _get_item_for_uri: function(uri) {
        for each(let item in this._list_view.items) {
            if(item.uri === uri) return item;
        }

        return -1;
    },

    on_captured_event: function(object, event) {
        this.parent(object, event);
        let [x, y, mods] = global.get_pointer();

        if(
            event.type() === Clutter.EventType.BUTTON_PRESS
            && this.is_point_outside_dialog(x, y))
        {
            this._search_entry.set_text('');
        }
    },

    resize: function() {
        let message_id = this._statusbar.add_message({
            text: 'Test1234!',
            has_spinner: true
        });
        this.parent();
        this._statusbar.remove_message(message_id);
    },

    activate_item: function(item) {
        this._show_note(item.uri);
    },

    delete_item: function(item) {
        let total_items = this._list_view.length;
        this._list_view.remove_item(item);
        Utils.get_client().delete_note(item.uri);
    },

    delete_note: function(uri) {
        let item = this._get_item_for_uri(uri);

        if(item !== -1) {
            this.delete_item(item);
        }
    },

    show: function(animation) {
        animation =
            animation === undefined
            ? Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY)
            : animation
        this.parent(animation);

        this._show_start_notes();

        if(!this._is_empty_entry(this._search_entry)) {
            this._search_entry.clutter_text.set_selection(
                0,
                this._search_entry.text.length
            );
            this._search_entry.grab_key_focus();
        }

        if(this._note_view.showed) {
            this._note_view.grab_key_focus();
        }
    },

    hide: function(animation) {
        animation =
            animation === undefined
            ? Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY)
            : animation
        this._list_view.unselect_all();
        this._list_view.hide_shortcuts();
        this.parent(animation);
    },

    destroy: function() {
        Utils.get_client().destroy();
        this.parent();
    },

    get search_text() {
        if(this._is_empty_entry(this._search_entry)) {
            return '';
        }

        return this._search_entry.text;
    }
});
