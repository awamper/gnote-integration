const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Shell = imports.gi.Shell;
const Tweener = imports.ui.tweener;
const Clutter = imports.gi.Clutter;
const Panel = imports.ui.panel;
const Params = imports.misc.params;

const CONNECTION_IDS = {
    captured_event: 0
};

const Dialog = new Lang.Class({
    Name: "Dialog",

    _init: function(params) {
        this.params = Params.parse(params, {
            width_percents: 45,
            height_percents: 95,
            animation_time: 0.5,
            style_class: ''
        });
        this.actor = new St.BoxLayout({
            reactive: true,
            track_hover:true,
            can_focus: true
        });
        this.actor.connect(
            'key-press-event',
            Lang.bind(this, this._on_key_press_event)
        );
        this.actor.connect(
            'key-release-event',
            Lang.bind(this, this._on_key_release_event)
        );
        Main.layoutManager.panelBox.add_child(this.actor);
        this.actor.lower_bottom();

        this.table = new St.Table({
            style_class: this.params.style_class,
            homogeneous: false
        });
        this.actor.add_child(this.table);

        this._open = false;
        this.resize();
    },

    _connect_captured_event: function() {
        CONNECTION_IDS.captured_event = global.stage.connect(
            'captured-event',
            Lang.bind(this, this.on_captured_event)
        );
    },

    _disconnect_captured_event: function() {
        if(CONNECTION_IDS.captured_event > 0) {
            global.stage.disconnect(CONNECTION_IDS.captured_event);
        }
    },

    _on_key_press_event: function(o, e) {
        let symbol = e.get_key_symbol()

        if(symbol === Clutter.Escape) {
            this.hide();
            return true;
        }

        return false;
    },

    _on_key_release_event: function(o, e) {
        return false;
    },

    _disconnect_all: function() {
        this._disconnect_captured_event();
    },

    is_point_outside_dialog: function(x, y) {
        if(x < this.actor.x || y > (this.actor.y + this.actor.height)) {
            return true;
        }

        return false;
    },

    on_captured_event: function(object, event) {
        if(event.type() !== Clutter.EventType.BUTTON_PRESS) return;

        let [x, y, mods] = global.get_pointer();

        if(this.is_point_outside_dialog(x, y)) this.hide();
    },

    resize: function() {
        let monitor = Main.layoutManager.currentMonitor;
        let is_primary = monitor.index === Main.layoutManager.primaryIndex;

        let available_height = monitor.height;
        if(is_primary) available_height -= Main.panel.actor.height;

        let my_width = monitor.width / 100 * this.params.width_percents;
        let my_height = available_height / 100 * this.params.height_percents;

        this._hidden_y = monitor.y - my_height;
        this._target_y = this._hidden_y + my_height;
        if(is_primary) this._target_y += Main.panel.actor.height;

        this.actor.x = (monitor.width + monitor.x) - my_width;
        this.actor.y = this._hidden_y;
        this.actor.width = my_width;
        this.actor.height = my_height;

        this.table.width = my_width;
        this.table.height = my_height;
    },

    show: function(animation, on_complete) {
        if(this._open) return;

        animation = animation ===
            undefined
            ? true
            : animation;
        let push_result = Main.pushModal(this.actor, {
            keybindingMode: Shell.KeyBindingMode.NORMAL
        });

        if(!push_result) return;

        this._open = true;
        this.actor.show();
        this.resize();

        if(animation) {
            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, {
                time: this.params.animation_time / St.get_slow_down_factor(),
                transition: 'easeOutBack',
                y: this._target_y,
                onComplete: Lang.bind(this, function() {
                    if(typeof on_complete === 'function') on_complete();
                })
            });
        }
        else {
            this.actor.y = this._target_y;
            if(typeof on_complete === 'function') on_complete();
        }

        this._connect_captured_event();
    },

    hide: function(animation, on_complete) {
        if(!this._open) return;

        Main.popModal(this.actor);
        this._open = false;
        this._disconnect_captured_event();
        animation = animation ===
            undefined
            ? true
            : animation;

        if(animation) {
            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, {
                time: this.params.animation_time / St.get_slow_down_factor(),
                transition: 'easeInBack',
                y: this._hidden_y,
                onComplete: Lang.bind(this, function() {
                    this.actor.hide();
                    if(typeof on_complete === 'function') on_complete();
                })
            });
        }
        else {
            this.actor.hide();
            this.actor.y = this._hidden_y;
            if(typeof on_complete === 'function') on_complete();
        }
    },

    toggle: function() {
        if(this._open) {
            this.hide();
        }
        else {
            this.show();
        }
    },

    destroy: function() {
        this._disconnect_all();
        this.actor.destroy();
    },

    get is_open() {
        return this._open;
    }
});
