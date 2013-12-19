const St = imports.gi.St;
const Lang = imports.lang;
const Tweener = imports.ui.tweener;
const Params = imports.misc.params;

const SHORTCUT_LABEL_ANIMATION_TIME = 0.3;

const ListViewItemBase = new Lang.Class({
    Name: "ListViewItemBase",

    _init: function(params) {
        this.params = Params.parse(params, {
            style_class: '',
            shortcut_style: ''
        });

        this.actor = new St.Table({
            style_class: this.params.style_class,
            reactive: true
        });

        this._shortcut = 0;
        this._shortcut_label = new St.Label({
            style_class: this.params.shortcut_style,
            opacity: 0,
            z_position: 1
        });

        this.actor.add(this._shortcut_label, {
            row: 0,
            col: 0,
            x_expand: false,
            y_expand: false,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.START,
            y_align: St.Align.MIDDLE
        });
    },

    show_shortcut: function() {
        if(this._shortcut < 1 || this._shortcut > 9) return;
        if(this._shortcut_label.opacity === 255) return;

        this._shortcut_label.show();

        Tweener.removeTweens(this._shortcut_label);
        Tweener.addTween(this._shortcut_label, {
            opacity: 255,
            time: SHORTCUT_LABEL_ANIMATION_TIME,
            transition: 'easeOutQuad'
        });
    },

    hide_shortcut: function() {
        if(this._shortcut_label.opacity === 0) return;

        Tweener.removeTweens(this._shortcut_label);
        Tweener.addTween(this._shortcut_label, {
            opacity: 0,
            time: SHORTCUT_LABEL_ANIMATION_TIME,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this._shortcut_label.hide();
            })
        });
    },

    hide: function() {
        this.hide_shortcut();
        this.actor.hide();
    },

    show: function() {
        this.actor.show();
    },

    destroy: function() {
        this.actor.destroy();
    },

    set shortcut(number) {
        if(number >= 1 && number <= 9) {
            this._shortcut = number;
            this._shortcut_label.set_text(number.toString());
        }
        else {
            this._shortcut = 0;
        }
    },

    get shortcut() {
        return this._shortcut;
    }
});
