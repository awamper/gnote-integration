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
const GnoteListViewTitleRenderer = Me.imports.gnote_list_view_title_renderer;
const GnoteListViewSnippetRenderer = Me.imports.gnote_list_view_snippet_renderer;
const GnoteNoteView = Me.imports.gnote_note_view;
const DesktopNotes = Me.imports.desktop_notes;
const Constants = Me.imports.constants;
const Shared = Me.imports.shared;

const TIMEOUT_TIMES = {
    SEARCH: 400
};
const TIMEOUT_IDS = {
    SEARCH: 0
};

const CONNECTION_IDS = {
    DESKTOP_NOTES: 0,
    ENABLED_NOTES: 0,
    ALL_NOTES_RENDERER: 0,
    SEARCH_NOTES_RENDERER: 0
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

        this._list_model = new ListView.Model();
        this._list_model.set_validator(Lang.bind(this, function(item) {
            return !Utils.is_blank(item);
        }));
        this._list_model.connect(
            "changed::items",
            Lang.bind(this, this._on_items_changed)
        );

        this._list_view = new ListView.ListView({
            scrollview_style: 'gnote-list-view-scrollbox',
            box_style: 'gnote-list-view-box',
            shortcut_style: 'gnote-shortcut-label'
        });
        this._list_view.set_model(this._list_model);
        this._list_view.set_renderer(this._get_user_renderer(
            PrefsKeys.ALL_NOTES_RENDERER_KEY
        ));
        this._list_view.connect(
            "clicked",
            Lang.bind(this, this._on_item_clicked)
        );

        this._items_counter = new ListView.ItemsCounter(this._list_model);
        this._toolbar = new GnoteToolbar.GnoteToolbar(this);
        this._init_search_entry();
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

        CONNECTION_IDS.DESKTOP_NOTES = Utils.SETTINGS.connect(
            'changed::' + PrefsKeys.ENABLE_DESKTOP_NOTES_KEY,
            Lang.bind(this, function() {
                this._notes_changed_trigger = true;
            })
        );
        CONNECTION_IDS.ENABLED_NOTES = Utils.SETTINGS.connect(
            'changed::' + PrefsKeys.ENABLED_DESKTOP_NOTES_KEY,
            Lang.bind(this, function() {
                this._notes_changed_trigger = true;
            })
        );
        CONNECTION_IDS.ALL_NOTES_RENDERER = Utils.SETTINGS.connect(
            'changed::' + PrefsKeys.ALL_NOTES_RENDERER_KEY,
            Lang.bind(this, function() {
                this._notes_changed_trigger = true;
            })
        );
        CONNECTION_IDS.SEARCH_NOTES_RENDERER = Utils.SETTINGS.connect(
            'changed::' + PrefsKeys.SEARCH_NOTES_RENDERER_KEY,
            Lang.bind(this, function() {
                this._notes_changed_trigger = true;
            })
        );

        Shared.gnote_integration = this;
    },

    _on_item_clicked: function(object, button, display, model, index) {
        switch(button) {
            case Clutter.BUTTON_SECONDARY:
                this.delete_item(model, index);
                break;
            case Clutter.BUTTON_MIDDLE:
                break;
            default:
                this.activate_item(model, index);
                break;
        }
    },

    _on_items_changed: function() {
        if(this._list_model.length > 0) {
            this._status_label.hide();
        }
        else {
            this._status_label.show();
        }
    },

    _init_note_view: function() {
        this._note_view = new GnoteNoteView.GnoteNoteView(this._list_view.actor);
        this._note_view.connect('url-clicked', Lang.bind(this, function(o, url) {
            if(Utils.starts_with(url, '/')) {
                url = 'file://' + url;
            }
            else if(url.indexOf(':') === -1) {
                url = 'http://' + url;
            }

            Gio.app_info_launch_default_for_uri(
                url,
                global.create_app_launch_context()
            );
            this._note_view.hide(false);
            this.hide(false);
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
            let selected_index = this._list_view.get_selected_index();

            if(selected_index !== -1) {
                this._list_view.select_previous();
            }
            else {
                this._list_view.select_first_visible();
            }

            return true;
        }
        else if(symbol === Clutter.Down) {
            let selected_index = this._list_view.get_selected_index();

            if(selected_index !== -1) {
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
            let selected_index = this._list_view.get_selected_index();

            if(selected_index !== -1) {
                this.activate_item(this._list_model, selected_index);
            }

            return true;
        }
        else if(symbol == Clutter.Delete) {
            let selected_index = this._list_view.get_selected_index();

            if(selected_index !== -1) {
                this.delete_item(this._list_model, selected_index);
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
                this._show_all_notes();
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

    _activate_by_shortcut: function(number) {
        let index = this._list_view.get_index_for_shortcut(number);
        if(index === -1) return;
        this.activate_item(this._list_model, index);
    },

    _get_user_renderer: function(settings_key) {
        let renderer = GnoteListViewSnippetRenderer.GnoteListViewSnippetRenderer;
        let user_renderer = Utils.SETTINGS.get_int(settings_key);

        if(user_renderer === Constants.RENDERER.TITLE) {
            renderer = GnoteListViewTitleRenderer.GnoteListViewTitleRenderer;
        }

        return renderer;
    },

    _show_notes: function(note_uris, renderer) {
        this._list_view.set_renderer(renderer);
        this._list_model.set_items(note_uris);
        this._list_view.select_first_visible();
    },

    _show_all_notes: function() {
        if(!this._notes_changed_trigger) return;

        this._notes_changed_trigger = false;
        let renderer = this._get_user_renderer(PrefsKeys.ALL_NOTES_RENDERER_KEY);
        Utils.get_client().list_all_notes(
            Lang.bind(this, function(uris, error) {
                if(!uris) {
                    Main.notify("Gnote Integration", error);
                    return;
                }

                this._show_notes(uris, renderer);
            })
        );
    },

    _search_notes: function(term) {
        let renderer = this._get_user_renderer(PrefsKeys.SEARCH_NOTES_RENDERER_KEY);
        Utils.get_client().search_notes(term, false,
            Lang.bind(this, function(uris, error) {
                if(!uris) {
                    Main.notify("Gnote Integration", error);
                    return;
                }

                this._show_notes(uris, renderer);
            })
        );
    },

    _show_note: function(uri) {
        this._note_view.load_note(uri);
        this._note_view.show();
    },

    _get_index_for_uri: function(uri) {
        for(let i = 0; i < this._list_model.length; i++) {
            if(this._list_model.get(i) === uri) return i;
        }

        return -1;
    },

    _disconnect_all: function() {
        if(CONNECTION_IDS.DESKTOP_NOTES > 0) {
            Utils.SETTINGS.disconnect(CONNECTION_IDS.DESKTOP_NOTES);
            CONNECTION_IDS.DESKTOP_NOTES = 0;
        }
        if(CONNECTION_IDS.ENABLED_NOTES > 0) {
            Utils.SETTINGS.disconnect(CONNECTION_IDS.ENABLED_NOTES);
            CONNECTION_IDS.ENABLED_NOTES = 0;
        }
        if(CONNECTION_IDS.ALL_NOTES_RENDERER > 0) {
            Utils.SETTINGS.disconnect(CONNECTION_IDS.ALL_NOTES_RENDERER);
            CONNECTION_IDS.ALL_NOTES_RENDERER = 0;
        }
        if(CONNECTION_IDS.SEARCH_NOTES_RENDERER > 0) {
            Utils.SETTINGS.disconnect(CONNECTION_IDS.SEARCH_NOTES_RENDERER);
            CONNECTION_IDS.SEARCH_NOTES_RENDERER = 0;
        }
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
        this.params.width_percents = Utils.SETTINGS.get_int(
            PrefsKeys.WIDTH_PERCENTS_KEY
        );
        this.params.height_percents = Utils.SETTINGS.get_int(
            PrefsKeys.HEIGHT_PERCENTS_KEY
        );
        let message_id = this._statusbar.add_message({
            text: 'Test1234!',
            has_spinner: true
        });
        this.parent();
        this._statusbar.remove_message(message_id);
    },

    activate_item: function(model, index) {
        this._show_note(model.get(index));
    },

    delete_item: function(model, index) {
        let uri = model.get(index);
        Utils.get_client().delete_note(uri);
        model.delete(index);
    },

    delete_note: function(uri) {
        let index = this._get_index_for_uri(uri);

        if(index !== -1) {
            this.delete_item(this._list_model, index);
        }
    },

    show: function(animation) {
        animation =
            animation === undefined
            ? Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY)
            : animation
        this.parent(animation);

        this._show_all_notes();

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
        this.parent(animation);
    },

    destroy: function() {
        this._statusbar.destroy();
        this._note_view.destroy();
        this._list_view.destroy();
        this._items_counter.destroy();
        Utils.get_client().destroy();
        Shared.gnote_integration = null;
        this.parent();
    },

    get search_text() {
        if(this._is_empty_entry(this._search_entry)) {
            return '';
        }

        return this._search_entry.text;
    },

    get statusbar() {
        return this._statusbar;
    }
});
