const St = imports.gi.St;
const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const GnoteListViewRendererBase = Me.imports.gnote_list_view_renderer_base;

const GnoteListViewTitleRenderer = new Lang.Class({
    Name: "GnoteListViewTitle",
    Extends: GnoteListViewRendererBase.GnoteListViewRendererBase,

    _init: function(params) {
        this.parent(params);
    },

    on_note_parsed: function() {
        this.title_label.clutter_text.set_markup(this.note.title);
        this.date_label.create_date = this.note.create_date;
        this.date_label.update_date = this.note.update_date;
    },

    get_display: function(model, index) {
        this.parent(model, index);
        this.title_label = this.get_title();
        this.date_label = this.get_date();
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
        this.actor.add(this.date_label.actor, {
            row: 1,
            col: 0,
            x_expand: false,
            y_expand: false,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.START,
            y_align: St.Align.MIDDLE
        });
        this.actor.add(this.buttons.actor, {
            row: 1,
            col: 1,
            x_expand: false,
            y_expand: false,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.END,
            y_align: St.Align.MIDDLE
        });

        this.parse_note(this.uri);

        return this.actor;
    },

    destroy: function() {
        this.buttons.destroy();
        this.date_label.destroy();
        this.parent();
    }
});
