const St = imports.gi.St;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const Tweener = imports.ui.tweener;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;

const CONNECTION_IDS = {
    CAPTURED_EVENT: 0
};

const NoteColorChooser = new Lang.Class({
    Name: 'NoteColorChooser',

    _init: function() {
        this.actor = new St.Table({
            style_class: 'desktop-note-color-chooser-box',
            visible: false,
            homogeneous: true,
            reactive: true
        });

        this._max_columns = 3;
        this._colors = this._get_colors();
        this._connection_id = Utils.SETTINGS.connect(
            'changed::' + PrefsKeys.DESKTOP_NOTES_COLORS_KEY,
            Lang.bind(this, function() {
                this._colors = this._get_colors();
            })
        );

        Main.uiGroup.add_child(this.actor);
    },

    _get_colors: function() {
        return Utils.SETTINGS.get_strv(PrefsKeys.DESKTOP_NOTES_COLORS_KEY);
    },

    _show_colors: function() {
        this.actor.destroy_all_children();

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
                this.actor.add(background, {
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

    _reposition: function() {
        let [x, y] = global.get_pointer();
        this.actor.x = x - this.actor.width;
        this.actor.y = y - this.actor.height;
    },

    _connect_captured_event: function() {
        CONNECTION_IDS.CAPTURED_EVENT = global.stage.connect(
            'captured-event',
            Lang.bind(this, this._on_captured_event)
        );
    },

    _disconnect_captured_event: function() {
        if(CONNECTION_IDS.CAPTURED_EVENT > 0) {
            global.stage.disconnect(CONNECTION_IDS.CAPTURED_EVENT);
            CONNECTION_IDS.CAPTURED_EVENT = 0;
        }
    },

    _on_captured_event: function(object, event) {
        let [x, y, mods] = global.get_pointer();
        let button_event = event.type() === Clutter.EventType.BUTTON_PRESS;
        let pointer_outside = !Utils.is_pointer_inside_actor(this.actor);

        if(button_event && pointer_outside) this.hide();
    },

    show: function() {
        if(this.actor.visible) return;

        this._show_colors();
        this._reposition();
        Main.pushModal(this.actor, {
            keybindingMode: Shell.KeyBindingMode.NORMAL
        });

        this.actor.opacity = 0;
        this.actor.show();

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            opacity: 255,
            time: 0.3,
            transition: 'easeOutQuad'
        });

        this._connect_captured_event();
    },

    hide: function() {
        if(!this.actor.visible) return;

        Main.popModal(this.actor);
        this._disconnect_captured_event();

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            opacity: 0,
            time: 0.3,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this.actor.hide();
                this.actor.opacity = 255;

                if(typeof on_complete === 'function') {
                    on_complete();
                }
            })
        });
    },

    destroy: function() {
        if(this._connection_id > 0) {
            Utils.SETTINGS.disconnect(this._connection_id);
        }

        this._disconnect_captured_event();
        this.actor.destroy();
    }
});
Signals.addSignalMethods(NoteColorChooser.prototype);
