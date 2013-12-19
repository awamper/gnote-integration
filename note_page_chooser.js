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

const NotePageChooser = new Lang.Class({
    Name: 'NotePageChooser',

    _init: function() {
        this.actor = new St.Table({
            style_class: 'desktop-note-page-chooser-box',
            visible: false,
            homogeneous: true,
            reactive: true
        });

        this._selected_index = 0;
        this._max_columns = 20;

        Main.uiGroup.add_child(this.actor);
    },

    _show_pages: function() {
        this.actor.destroy_all_children();

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

            this.actor.add(button, {
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

        this._show_pages();
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
        this._disconnect_captured_event();
        this.actor.destroy();
    },

    set selected(selected) {
        this._selected_index = selected;
    }
});
Signals.addSignalMethods(NotePageChooser.prototype);
