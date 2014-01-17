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
const GnoteNote = Me.imports.gnote_note;
const GnoteToolbar = Me.imports.gnote_toolbar;
const ListView = Me.imports.list_view;
const GnoteListViewTitleRenderer = Me.imports.gnote_list_view_title_renderer;
const GnoteListViewSnippetRenderer = Me.imports.gnote_list_view_snippet_renderer;
const DialogNoteView = Me.imports.dialog_note_view;
const DesktopNotes = Me.imports.desktop_notes;
const Constants = Me.imports.constants;
const Shared = Me.imports.shared;
const ConfirmationModalDialog = Me.imports.confirmation_modal_dialog;
const LinkPreviewDialog = Me.imports.link_preview_dialog;
const DesktopNoteContainer = Me.imports.desktop_note_container;

const TIMEOUT_TIMES = {
    SEARCH: 400
};
const TIMEOUT_IDS = {
    SEARCH: 0,
    LINK_PREVIEW: 0
};

const CONNECTION_IDS = {
    DESKTOP_NOTES: 0,
    ENABLED_NOTES: 0,
    ALL_NOTES_RENDERER: 0,
    SEARCH_NOTES_RENDERER: 0,
    DESKTOP_NOTES_MODAL_HIDING: 0
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
            shortcut_style: 'gnote-shortcut-label',
            can_drag: true
        });
        this._list_view.set_model(this._list_model);
        this._list_view.set_renderer(this._get_user_renderer(
            PrefsKeys.ALL_NOTES_RENDERER_KEY
        ));
        this._list_view.connect(
            "clicked",
            Lang.bind(this, this._on_item_clicked)
        );
        this._list_view.connect(
            'drag-begin',
            Lang.bind(this, this._on_item_drag_begin)
        );
        this._list_view.connect(
            'drag-end',
            Lang.bind(this, this._on_item_drag_end)
        );
        this._list_view.connect(
            'drag-progress',
            Lang.bind(this, this._on_item_drag_progress)
        );

        this._items_counter = new ListView.ItemsCounter(this._list_model);
        this._toolbar = new GnoteToolbar.GnoteToolbar(this);
        this._link_preview_dialog = new LinkPreviewDialog.LinkPreviewDialog();
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
        this.table.add(this._note_view.actor, {
            row: 0,
            row_span: 3,
            col: 0,
            col_span: 3,
            x_fill: true,
            x_expand: true,
            y_fill: true,
            y_expand: false,
            y_align: St.Align.START,
            x_align: St.Align.START
        });

        this._loading_message_id = 0;
        this._notes_changed_trigger = true;
        this._drag_container = null;

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
                this.activate_item_alt(model, index);
                break;
            case Clutter.BUTTON_MIDDLE:
                break;
            default:
                this.activate_item(model, index);
                break;
        }
    },

    _on_item_drag_begin: function(list_view, action_data, item_index) {
        let uri = this._list_model.get(item_index);
        if(Shared.desktop_notes.is_note_on_desktop(uri)) return;
        let note = new GnoteNote.GnoteNote(uri);
        note.properties = Shared.desktop_notes.get_note_properties(uri);
        note.connect(
            "notify::parsed",
            Lang.bind(this, function() {
                this.set_opacity(0);
                Shared.desktop_notes.show_modal();
                Shared.desktop_notes.set_notes_opacity(150);

                this._drag_container =
                    new DesktopNoteContainer.DesktopNoteContainer(
                        Shared.desktop_notes,
                        note
                    );
                this._drag_container.actor.show();
                Main.uiGroup.add_child(this._drag_container.actor);
            })
        );
        note.start_parsing();
        CONNECTION_IDS.DESKTOP_NOTES_MODAL_HIDING =
            Shared.desktop_notes.connect(
                'modal-hiding',
                Lang.bind(this, function() {
                    if(this._drag_container !== null) {
                        this._drag_container.destroy();
                        this._drag_container = null;
                    }
                })
            );
    },

    _on_item_drag_end: function(list_view, action_data, item_index) {
        if(CONNECTION_IDS.DESKTOP_NOTES_MODAL_HIDING > 0) {
            Shared.desktop_notes.disconnect(
                CONNECTION_IDS.DESKTOP_NOTES_MODAL_HIDING
            );
            CONNECTION_IDS.DESKTOP_NOTES_MODAL_HIDING = 0;
        }

        this.set_opacity(255);
        Shared.desktop_notes.hide_modal();
        Shared.desktop_notes.set_notes_opacity(255);

        if(this._drag_container !== null) {
            let properties = {
                x: this._drag_container.actor.x,
                y: this._drag_container.actor.y
            };
            Shared.desktop_notes.add_note(
                this._list_model.get(item_index),
                properties
            );
            this._drag_container.destroy();
            this._drag_container = null;
        }
    },

    _on_item_drag_progress: function(list_view, action_data) {
        if(this._drag_container === null) return false;

        let position = action_data.action.get_motion_coords();
        this._drag_container.actor.x = position[0];
        this._drag_container.actor.y = position[1];
        return true;
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
        this._note_view = new DialogNoteView.DialogNoteView(
            this._list_view.actor
        );
        this._note_view.connect('url-clicked',
            Lang.bind(this, function(o, uri) {
                Utils.open_uri(uri);
                this._note_view.hide(false);
                this.hide(false);
            })
        );
        this._note_view.connect('note-clicked',
            Lang.bind(this, function(o, title) {
                Utils.get_client().find_note(title,
                    Lang.bind(this, function(uri) {
                        if(!uri) return;

                        this._show_note(uri);
                    })
                );
            })
        );
        this._note_view.connect('link-enter',
            Lang.bind(this, function(o, url_data) {
                if(TIMEOUT_IDS.LINK_PREVIEW !== 0) {
                    Mainloop.source_remove(TIMEOUT_IDS.LINK_PREVIEW);
                }

                let timeout;

                if(url_data.type === GnoteNote.LINK_TYPES.NOTE) {
                    timeout = Utils.SETTINGS.get_int(
                        PrefsKeys.PREVIEW_NOTE_TIMEOUT_MS_KEY
                    );
                }
                else {
                    timeout = Utils.SETTINGS.get_int(
                        PrefsKeys.PREVIEW_LINK_TIMEOUT_MS_KEY
                    );
                }

                TIMEOUT_IDS.LINK_PREVIEW = Mainloop.timeout_add(timeout,
                    Lang.bind(this, function() {
                        if(url_data.type === GnoteNote.LINK_TYPES.NOTE) {
                            Utils.get_client().find_note(url_data.url,
                                Lang.bind(this, function(note_uri) {
                                    if(!note_uri) return;
                                    this._link_preview_dialog.preview(note_uri);
                                })
                            );
                        }
                        else if(url_data.type === GnoteNote.LINK_TYPES.URL) {
                            this._link_preview_dialog.preview(url_data.url);
                        }
                    })
                );
            })
        );
        this._note_view.connect('link-leave',
            Lang.bind(this, function(o) {
                if(TIMEOUT_IDS.LINK_PREVIEW !== 0) {
                    Mainloop.source_remove(TIMEOUT_IDS.LINK_PREVIEW);
                }

                this._link_preview_dialog.hide();
            })
        );
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
                this._list_view.hide_shortcuts();
            }
            else if(unichar === 'n' && !this._is_empty_entry(this._search_entry)) {
                let search_text = this._search_entry.text.trim();
                this.hide(false);
                this.clear_search();
                Utils.get_client().create_named_note(
                    search_text,
                    Lang.bind(this, function(uri) {
                        if(!uri) return;

                        Utils.get_client().display_note(uri);
                    })
                );
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
                if(e.has_control_modifier()) {
                    this.activate_item_alt(this._list_model, selected_index);
                }
                else {
                    this.activate_item(this._list_model, selected_index);
                }
            }

            return true;
        }
        else if(symbol == Clutter.Delete) {
            let selected_index = this._list_view.get_selected_index();
            if(selected_index === -1) return false;

            Utils.get_client().get_note_title(
                this._list_model.get(selected_index),
                Lang.bind(this, function(title) {
                    if(!title) return;

                    let modal = new ConfirmationModalDialog.ConfirmationModalDialog({
                        box_style: 'confirmation-modal-dialog-box',
                        button_style: 'confirmation-modal-dialog-button',
                        message_style: 'confirmation-modal-dialog-message',
                        source_actor: this.actor,
                        destroy_on_close: true,
                        message: 'Delete "%s"?'.format(title)
                    });
                    modal.connect('activated',
                        Lang.bind(this, function(button, type) {
                            if(type === ConfirmationModalDialog.BUTTON_TYPES.OK) {
                                this.delete_item(this._list_model, selected_index);
                            }
                        })
                    );
                    modal.show();
                })
            );

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
                this.clear_search();
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

        if(
            Utils.SETTINGS.get_int(PrefsKeys.SHORTCUT_ACTIVATE_ACTION_KEY)
            === Constants.SHORTCUT_ACTIVATE_ACTIONS.VIEW_NOTE
        ) {
            this.activate_item(this._list_model, index);
        }
        else {
            this.activate_item_alt(this._list_model, index);
        }
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
        let note = new GnoteNote.GnoteNote(uri);
        note.connect(
            'notify::parsed',
            Lang.bind(this, function() {
                this._note_view.set_note(note);
                this._note_view.show();
            })
        );
        note.start_parsing();
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
            this.clear_search();
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

    activate_item_alt: function(model, index) {
        this.hide(false);

        if(!this._is_empty_entry(this._search_entry)) {
            Utils.get_client().display_note_with_search(
                model.get(index),
                this._search_entry.text
            );
            this.clear_search();
        }
        else {
            Utils.get_client().display_note(model.get(index));
        }
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

    set_opacity: function(opacity) {
        this.actor.opacity = opacity;
    },

    show: function(animation) {
        animation =
            animation === undefined
            ? Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY)
            : animation
        this.parent(animation);

        this._list_view.reset_scroll();
        this._list_view.select_first();
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
        this._list_view.hide_shortcuts();
        this.parent(animation);
    },

    clear_search: function(reset_trigger) {
        if(this._is_empty_entry(this._search_entry)) return;

        this._search_entry.set_text('');
        this._notes_changed_trigger = true;
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

    get search_entry() {
        return this._search_entry;
    },

    get statusbar() {
        return this._statusbar;
    }
});
