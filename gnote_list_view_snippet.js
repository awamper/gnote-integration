const St = imports.gi.St;
const Lang = imports.lang;
const Pango = imports.gi.Pango;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const GnoteListViewItemBase = Me.imports.gnote_list_view_item_base;

const GnoteListViewSnippet = new Lang.Class({
    Name: "GnoteListViewSnippet",
    Extends: GnoteListViewItemBase.GnoteListViewItemBase,

    _init: function(uri, gnote_integration) {
        this.parent(uri, gnote_integration);

        this.init_title();
        this.init_date();
        this.init_snippet();
        this.init_buttons();

        this.actor.add(this.title_label, {
            row: 0,
            col: 0,
            col_span: 2,
            x_expand: true,
            x_fill: true,
            x_align: St.Align.START,
            y_expand: false,
            y_fill: false,
            y_align: St.Align.MIDDLE
        });
        this.actor.add(this.snippet_label, {
            row: 1,
            col: 0,
            col_span: 2,
            x_expand: false,
            y_expand: false,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.START,
            y_align: St.Align.MIDDLE
        });
        this.actor.add(this.date_label, {
            row: 2,
            col: 0,
            x_expand: false,
            y_expand: false,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.START,
            y_align: St.Align.MIDDLE
        });
        this.actor.add(this.buttons.actor, {
            row: 2,
            col: 1,
            x_expand: false,
            y_expand: false,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.START,
            y_align: St.Align.MIDDLE
        });

        this.parse_note();
    },

    _prepare_snippet: function(content) {
        let snippet = content.replace(/\s{2,}|\n{1,}/gm, ' ');

        return snippet;
    },

    on_note_parsed: function() {
        this.parent();

        let max_length = Utils.SETTINGS.get_int(PrefsKeys.MAX_SNIPPET_LENGTH_KEY);
        let snippet = this.note.content.slice(0, max_length);
        snippet = this._prepare_snippet(snippet);
        this.snippet_label.clutter_text.set_max_length(max_length);
        this.snippet_label.set_text(snippet);
    },

    init_snippet: function() {
        this.snippet_label = new St.Label({
            text: '...',
            style_class: 'gnote-snippet-label',
            style: 'font-size: %spx;'.format(
                Utils.SETTINGS.get_int(PrefsKeys.SNIPPET_SIZE_KEY)
            )
        });
        this.snippet_label.clutter_text.line_wrap = true;
        this.snippet_label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD;
        this.snippet_label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    },
});
