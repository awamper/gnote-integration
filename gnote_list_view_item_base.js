const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const ListViewItemBase = Me.imports.list_view_item_base;
const GnoteNote = Me.imports.gnote_note;
const GnoteListItemButtons = Me.imports.gnote_list_item_buttons;
const NoteDateLabel = Me.imports.note_date_label;

const GnoteListViewItemBase = new Lang.Class({
    Name: 'GnoteListViewItemBase',
    Extends: ListViewItemBase.ListViewItemBase,

    _init: function(uri, gnote_integration) {
        this.parent({
            style_class: 'gnote-item-box',
            shortcut_style: 'gnote-shortcut-label'
        });

        this.uri = uri;
        this._gnote_integration = gnote_integration;
    },

    parse_note: function() {
        this.note = new GnoteNote.GnoteNote(this.uri);
        this.note.connect('notify::parsed', Lang.bind(this, this.on_note_parsed));
        this.note.start_parsing();
    },

    on_note_parsed: function() {
        this.title_label.set_text(this.note.title);
        this.date_label.create_date = this.note.create_date;
        this.date_label.update_date = this.note.update_date;
    },

    init_title: function() {
        this.title_label = new St.Label({
            style_class: 'gnote-title-label',
            text: '...',
            style: 'font-size: %spx;'.format(
                Utils.SETTINGS.get_int(PrefsKeys.TITLE_SIZE_KEY)
            )
        });
    },

    init_date: function() {
        this.date_label = new NoteDateLabel.NoteDateLabel({
            style_class: 'gnote-date-label',
            font_size: Utils.SETTINGS.get_int(PrefsKeys.DATE_SIZE_KEY)
        });
    },

    init_buttons: function() {
        this.buttons = new GnoteListItemButtons.GnoteListItemButtons(
            this.uri,
            this._gnote_integration
        );
    }
});
