const St = imports.gi.St;
const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const GnoteListViewItemBase = Me.imports.gnote_list_view_item_base;

const GnoteListViewTitle = new Lang.Class({
    Name: "GnoteListViewTitle",
    Extends: GnoteListViewItemBase.GnoteListViewItemBase,

    _init: function(uri) {
        this.parent(uri);

        this.init_title();
        this.init_date();

        this.actor.add(this.title_label, {
            row: 0,
            col: 0,
            x_expand: true,
            x_fill: true,
            x_align: St.Align.START,
            y_expand: false,
            y_fill: false,
            y_align: St.Align.MIDDLE
        });
        this.actor.add(this.date_label, {
            row: 1,
            col: 0,
            x_expand: false,
            y_expand: false,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.START,
            y_align: St.Align.MIDDLE
        });

        this.parse_note();
    }
});
