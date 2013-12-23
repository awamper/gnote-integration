const St = imports.gi.St;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const GnoteNote = Me.imports.gnote_note;
const GnoteListItemButtons = Me.imports.gnote_list_item_buttons;
const NoteDateLabel = Me.imports.note_date_label;
const ListView = Me.imports.list_view;

const GnoteListViewRendererBase = new Lang.Class({
    Name: 'GnoteListViewRendererBase',
    Extends: ListView.RendererBase,

    _init: function(params) {
        this.parent({
            style_class: 'gnote-item-box'
        });
    },

    get_display: function(model, index) {
        this.uri = model.get(index);

        if(Utils.is_blank(this.uri)) {
            throw new Error(
                'GnoteListViewRendererBase:_get_display(): uri is undefined'
            );
        }
    },

    parse_note: function(uri) {
        Mainloop.idle_add(Lang.bind(this, function() {
            this.note = new GnoteNote.GnoteNote(uri);
            this.note.connect('notify::parsed', Lang.bind(this, this.on_note_parsed));
            this.note.start_parsing();
        }));
    },

    on_note_parsed: function() {
        // nothing
    },

    get_title: function() {
        let title_label = new St.Label({
            style_class: 'gnote-title-label',
            text: '...',
            style: 'font-size: %spx;'.format(
                Utils.SETTINGS.get_int(PrefsKeys.TITLE_SIZE_KEY)
            )
        });

        return title_label;
    },

    get_date: function() {
        let date_label = new NoteDateLabel.NoteDateLabel({
            style_class: 'gnote-date-label',
            font_size: Utils.SETTINGS.get_int(PrefsKeys.DATE_SIZE_KEY)
        });

        return date_label;
    },

    get_buttons: function() {
        let buttons = new GnoteListItemButtons.GnoteListItemButtons(
            this.uri,
            this._gnote_integration
        );

        return buttons;
    }
});
