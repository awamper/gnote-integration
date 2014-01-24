const St = imports.gi.St;
const Lang = imports.lang;
const Pango = imports.gi.Pango;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const GnoteListViewRendererBase = Me.imports.gnote_list_view_renderer_base;
const Shared = Me.imports.shared;

const HIGHLIGHT_MARKUP = {
    OPEN: '<span background="yellow" foreground="black">',
    CLOSE: '</span>'
};

const GnoteListViewSnippetRenderer = new Lang.Class({
    Name: "GnoteListViewSnippet",
    Extends: GnoteListViewRendererBase.GnoteListViewRendererBase,

    _init: function(params) {
        this.parent(params);
    },

    _prepare_snippet: function(content) {
        let snippet = content.replace(/\s{2,}|\n{1,}/gm, ' ');
        return snippet;
    },

    _highlight: function(string, term) {
        string = string.replace(
            new RegExp('(' + Utils.preg_quote(term) + ')', 'gi'),
            Lang.bind(this, function(match) {
                return '[HIGHLIGHT_START]' + match + '[HIGHLIGHT_STOP]'
            })
        );
        string = Utils.escape_markup(string);
        string = string.replace(/\[HIGHLIGHT_START\]/g, HIGHLIGHT_MARKUP.OPEN);
        string = string.replace(/\[HIGHLIGHT_STOP\]/g, HIGHLIGHT_MARKUP.CLOSE);

        return string;
    },

    on_note_parsed: function() {
        let search_term = Shared.gnote_integration.search_text;
        let title;

        if(!Utils.is_blank(search_term)) {
            title = this._highlight(this.note.title, search_term);
        }
        else {
            title = Utils.escape_markup(this.note.title);
        }

        this.title_label.clutter_text.set_markup(title);
        this.date_label.create_date = this.note.create_date;
        this.date_label.update_date = this.note.update_date;

        let max_length = Utils.SETTINGS.get_int(
            PrefsKeys.MAX_SNIPPET_LENGTH_KEY
        );
        let snippet = this._prepare_snippet(this.note.content);

        if(!Utils.is_blank(search_term)) {
            snippet = this._highlight(snippet, search_term);
            let start_index = snippet.indexOf(HIGHLIGHT_MARKUP.OPEN);

            if(start_index !== -1 && start_index > max_length) {
                let rest = snippet.length - start_index;
                if(rest < max_length) start_index -= max_length - rest;
                snippet = "..." + snippet.slice(start_index);
            }
        }
        else {
            snippet = Utils.escape_markup(snippet);
        }

        this.snippet_label.clutter_text.set_max_length(max_length);
        this.snippet_label.clutter_text.set_markup(snippet);
    },

    get_snippet: function() {
        let snippet_label = new St.Label({
            text: '...',
            style_class: 'gnote-snippet-label',
            style: 'font-size: %spx;'.format(
                Utils.SETTINGS.get_int(PrefsKeys.SNIPPET_SIZE_KEY)
            )
        });
        snippet_label.clutter_text.line_wrap = true;
        snippet_label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD;
        snippet_label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

        return snippet_label;
    },

    get_display: function(model, index) {
        this.parent(model, index);

        this.title_label = this.get_title();
        this.date_label = this.get_date();
        this.snippet_label = this.get_snippet();
        this.buttons = this.get_buttons();

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
        this.actor.add(this.date_label.actor, {
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

        this.parse_note(this.uri);

        return this.actor;
    },

    destroy: function() {
        this.date_label.destroy();
        this.buttons.destroy();
        this.parent();
    }
});
