const St = imports.gi.St;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Signals = imports.signals;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const PopupDialog = Me.imports.popup_dialog;

const NotePageChooser = new Lang.Class({
    Name: 'NotePageChooser',
    Extends: PopupDialog.PopupDialog,

    _init: function() {
        this.parent();
        this._table = new St.Table({
            style_class: 'desktop-note-page-chooser-box',
            homogeneous: true,
            reactive: true
        });

        this._selected_index = 0;
        this._max_columns = 20;

        this.actor.add(this._table);
        this.actor.z_position = 1;
    },

    _show_pages: function() {
        this._table.destroy_all_children();

        let column = 0;
        let row = 0;
        let max_pages = Utils.SETTINGS.get_int(
            PrefsKeys.DESKTOP_NOTES_MAX_PAGES
        );

        for(let i = 0; i < max_pages; i++) {
            let page_index = i;
            let button = new St.Button({
                style_class: 'desktop-note-page-chooser-button',
                label: (page_index + 1).toString(),
                width: 30,
                height: 20
            });
            button.connect('clicked', Lang.bind(this, function() {
                this.emit('page-activated', page_index);
            }));

            if(page_index === this._selected_index) {
                button.add_style_pseudo_class('selected');
                button.set_reactive(false);
            }

            this._table.add(button, {
                row: row,
                col: column,
                x_fill: true,
                y_fill: true,
                x_expand: true,
                y_expand: true,
                x_align: St.Align.MIDDLE,
                y_align: St.Align.MIDDLE
            });

            if(column >= this._max_columns) {
                column = 0;
                row++;
            }
            else {
                column++;
            }
        }
    },

    show: function() {
        if(this.actor.visible) return;

        this._show_pages();
        this.parent();
    },

    set selected(selected) {
        this._selected_index = selected;
    }
});
Signals.addSignalMethods(NotePageChooser.prototype);
