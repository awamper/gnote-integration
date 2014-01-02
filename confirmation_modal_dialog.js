const St = imports.gi.St;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Clutter = imports.gi.Clutter;
const Signals = imports.signals;
const Params = imports.misc.params;
const Tweener = imports.ui.tweener;
const Main = imports.ui.main;

const ANIMATION_TIMES = {
    SHOW: 0.3,
    HIDE: 0.3
};

const BUTTON_TYPES = {
    OK: 0,
    CANCEL: 1
};

const ConfirmationModalDialog = new Lang.Class({
    Name: 'ConfirmationModalDialog',

    _init: function(params) {
        this.params = Params.parse(params, {
            box_style: '',
            button_style: '',
            message_style: '',
            ok_label: 'Yes',
            cancel_label: 'No',
            message: 'Are you sure?',
            source_actor: null,
            selected_button: BUTTON_TYPES.OK,
            destroy_on_close: true
        });

        if(!this.params.source_actor) {
            throw new Error(
                'ConfirmationModalDialog:_init(): source actor is not setted'
            );
        }

        this.params.source_actor.connect('destroy',
            Lang.bind(this, this.destroy)
        );

        this.actor = new St.BoxLayout({
            style: 'background-color: rgba(0, 0, 0, 0.7)',
            reactive: true
        });
        this.actor.connect('key-release-event',
            Lang.bind(this, this._on_key_release_event)
        );
        this.actor.hide();

        this._table = new St.Table({
            style_class: this.params.box_style
        });
        this.actor.add(this._table, {
            x_expand: true,
            y_expand: true,
            x_fill: false,
            y_fill: false
        });

        this._message = new St.Label({
            text: this.params.message,
            style_class: this.params.message_style
        });

        this._ok_btn = new St.Button({
            label: this.params.ok_label,
            style_class: this.params.button_style,
            track_hover: true
        });
        this._ok_btn.connect('clicked',
            Lang.bind(this, function() {
                this._activate_button(BUTTON_TYPES.OK);
            })
        );
        this._cancel_btn = new St.Button({
            label: this.params.cancel_label,
            style_class: this.params.button_style
        });
        this._cancel_btn.connect('clicked',
            Lang.bind(this, function() {
                this._activate_button(BUTTON_TYPES.CANCEL);
            })
        );

        this._table.add(this._message, {
            row: 0,
            col: 0,
            col_span: 2,
            x_expand: true,
            y_expand: true,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });
        this._table.add(this._ok_btn, {
            row: 1,
            col: 0,
            x_expand: true,
            y_expand: true,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.END,
            y_align: St.Align.MIDDLE
        });
        this._table.add(this._cancel_btn, {
            row: 1,
            col: 1,
            x_expand: true,
            y_expand: true,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });

        Main.uiGroup.add_child(this.actor);
        this._select_button(this.params.selected_button);
    },

    _on_key_release_event: function(o, e) {
        let symbol = e.get_key_symbol();
        let enter = symbol === Clutter.Return || symbol === Clutter.KP_Enter;

        if(symbol === Clutter.Escape) {
            this.hide();
        }
        else if(
            symbol === Clutter.Tab
            || symbol === Clutter.Left
            || symbol === Clutter.Right
        ) {
            this._toogle_selection();
        }
        else if(enter) {
            this._activate_button(this._get_selected());
        }

        return true;
    },

    _resize: function() {
        this.actor.width = this.params.source_actor.width;
        this.actor.height = this.params.source_actor.height;
    },

    _reposition: function() {
        let [x, y] = this.params.source_actor.get_transformed_position();
        this.actor.x = x;
        this.actor.y = y;
        this._table.x = this.actor.width / 2 - this._table.width / 2;
        this._table.y = this.actor.height / 2 - this._table.height / 2;
    },

    _get_selected: function() {
        if(this._ok_btn.has_style_pseudo_class('hover')) {
            return BUTTON_TYPES.OK;
        }
        else {
            return BUTTON_TYPES.CANCEL
        }
    },

    _toogle_selection: function() {
        if(this._get_selected() === BUTTON_TYPES.OK) {
            this._select_button(BUTTON_TYPES.CANCEL);
        }
        else {
            this._select_button(BUTTON_TYPES.OK);
        }
    },

    _select_button: function(button_type) {
        if(button_type === BUTTON_TYPES.OK) {
            this._ok_btn.add_style_pseudo_class('hover');
            this._cancel_btn.remove_style_pseudo_class('hover');
        }
        else {
            this._ok_btn.remove_style_pseudo_class('hover');
            this._cancel_btn.add_style_pseudo_class('hover');
        }
    },

    _activate_button: function(button_type) {
        this.hide();
        this.emit('activated', button_type);
    },

    show: function() {
        if(this.actor.visible) return;

        let result = Main.pushModal(this.actor, {
            keybindingMode: Shell.KeyBindingMode.NORMAL
        });
        if(!result) return;

        this._resize();
        this._reposition();
        this.actor.opacity = 0;
        this.actor.show();

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            time: ANIMATION_TIMES.SHOW,
            transition: 'easeOutQuad',
            opacity: 255
        });
    },

    hide: function() {
        if(this.actor.opacity === 0) return;

        Main.popModal(this.actor);

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            time: ANIMATION_TIMES.HIDE,
            transition: 'easeOutQuad',
            opacity: 0,
            onComplete: Lang.bind(this, function() {
                this.actor.hide();

                if(this.params.destroy_on_close) {
                    this.destroy();
                }
            })
        });
    },

    destroy: function() {
        this.actor.destroy();
    }
});
Signals.addSignalMethods(ConfirmationModalDialog.prototype);
