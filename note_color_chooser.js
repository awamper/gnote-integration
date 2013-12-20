const St = imports.gi.St;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Signals = imports.signals;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const PopupDialog = Me.imports.popup_dialog;

const CONNECTION_IDS = {
    COLORS: 0
};

const NoteColorChooser = new Lang.Class({
    Name: 'NoteColorChooser',
    Extends: PopupDialog.PopupDialog,

    _init: function() {
        this.parent();
        this._table = new St.Table({
            style_class: 'desktop-note-color-chooser-box',
            homogeneous: true,
            reactive: true
        });

        this._max_columns = 3;
        this._colors = this._get_colors();
        CONNECTION_IDS.COLORS = Utils.SETTINGS.connect(
            'changed::' + PrefsKeys.DESKTOP_NOTES_COLORS_KEY,
            Lang.bind(this, function() {
                this._colors = this._get_colors();
            })
        );

        this.actor.add(this._table);
    },

    _get_colors: function() {
        return Utils.SETTINGS.get_strv(PrefsKeys.DESKTOP_NOTES_COLORS_KEY);
    },

    _show_colors: function() {
        this._table.destroy_all_children();

        let column = 0;
        let row = 0;

        for(let i in this._colors) {
            let color_string = this._colors[i];
            let [res, color] = Clutter.Color.from_string(color_string);

            if(res) {
                let background = new St.BoxLayout({
                    style_class: 'desktop-note-color-box'
                });
                let button = new St.Button({
                    style_class: 'desktop-note-color-button'
                });
                button.set_background_color(color);
                button.connect('clicked', Lang.bind(this, function() {
                    this.emit('color-activated', color);
                }));
                background.add(button, {
                    x_fill: false,
                    y_fill: false,
                    x_expand: true,
                    y_expand: true,
                    x_align: St.Align.MIDDLE,
                    y_align: St.Align.MIDDLE
                });
                this._table.add(background, {
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
        }
    },

    show: function() {
        if(this.actor.visible) return;

        this._show_colors();
        this.parent();
    },

    destroy: function() {
        if(CONNECTION_IDS.COLORS > 0) {
            Utils.SETTINGS.disconnect(CONNECTION_IDS.COLORS);
            CONNECTION_IDS.COLORS = 0;
        }

        this.parent();
    }
});
Signals.addSignalMethods(NoteColorChooser.prototype);
