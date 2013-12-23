const St = imports.gi.St;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Params = imports.misc.params;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const TIMEOUT_IDS = {
    ENTER: 0
};

const ANIMATION_TIMES = {
    DATE: 0.2
};

const NoteDateLabel = new Lang.Class({
    Name: 'NoteDateLabel',

    _init: function(params) {
        this.params = Params.parse(params, {
            style_class: '',
            create_date: 0,
            update_date: 0,
            font_size: 12
        });
        this._hovered = false;

        this._create_template =
            '<i>Created: <span weight="bold">%s</span></i>';
        this._create_markup = this._create_template.format('...');
        this._update_template =
            '<i>Last changed: <span weight="bold">%s</span></i>';
        this._update_markup = this._update_template.format('...');

        this.actor = new St.Label({
            style_class: this.params.style_class,
            reactive: true,
            style: 'font-size: %spx;'.format(this.params.font_size)
        });
        this.actor.clutter_text.set_markup(this._update_markup);
        this.actor.connect("enter-event", Lang.bind(this, this._on_enter_event));
        this.actor.connect("leave-event", Lang.bind(this, this._on_leave_event));

        if(this.params.create_date > 0) {
            this.create_date = this.params.create_date;
        }
        if(this.params.update_date > 0) {
            this.update_date = this.params.update_date;
        }
    },

    _on_enter_event: function() {
        if(this._hovered) return;

        TIMEOUT_IDS.ENTER = Mainloop.timeout_add(300, Lang.bind(this, function() {
            this._hovered = true;
            this._show_create_date();
        }));
    },

    _on_leave_event: function() {
        this._remove_timeout();

        if(!this._hovered) return;

        this._hovered = false;
        this._show_update_date();
    },

    _remove_timeout: function() {
        if(TIMEOUT_IDS.ENTER > 0) {
            Mainloop.source_remove(TIMEOUT_IDS.ENTER);
            TIMEOUT_IDS.ENTER = 0;
        }
    },

    _show_create_date: function(animation) {
        animation = animation === false ? false : true;

        if(animation) {
            Utils.label_transition(
                this.actor,
                this._create_markup,
                ANIMATION_TIMES.DATE
            );
        }
        else {
            this.actor.clutter_text.set_markup(this._create_markup);
        }
    },

    _show_update_date: function(animation) {
        animation = animation === false ? false : true;

        if(animation) {
            Utils.label_transition(
                this.actor,
                this._update_markup,
                ANIMATION_TIMES.DATE
            );
        }
        else {
            this.actor.clutter_text.set_markup(this._update_markup);
        }
    },

    destroy: function() {
        this._remove_timeout();
        this.actor.destroy();
    },

    set create_date(date) {
        this._create_date = date;

        let date_string = Utils.get_date_string(date);
        this._create_markup = this._create_template.format(date_string);

        if(this._hovered) this._show_create_date(false);
    },

    get create_date() {
        return this._create_date;
    },

    set update_date(date) {
        this._update_date = date;

        let date_string = Utils.get_date_string(date);
        this._update_markup = this._update_template.format(date_string);

        if(!this._hovered) this._show_update_date(false);
    },

    get update_date() {
        return this._update_date;
    }
});
