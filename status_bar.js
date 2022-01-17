const St = imports.gi.St;
const Lang = imports.lang;
const Animation = imports.ui.animation;
const Tweener = imports.tweener.tweener;
const Mainloop = imports.mainloop;
const Params = imports.misc.params;
const Gio = imports.gi.Gio;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const MESSAGE_TYPES = {
    error: 0,
    info: 1,
    success: 2
};

const StatusBarMessage = new Lang.Class({
    Name: 'StatusBarMessage',

    _init: function(params) {
        this._params = Params.parse(params, {
            text: '',
            timeout: 0,
            type: MESSAGE_TYPES.info,
            has_spinner: false
        });
        this._text = this._params.text;
        this._type = this._params.type;
        this._timeout = this._params.timeout;
        this._has_spinner = this._params.has_spinner;
        this._markup = this._prepare_message(this._text, this._type);
    },

    _prepare_message: function(message, type) {
        message = message.trim();
        message = Utils.escape_html(message);

        let message_markup = '<span color="%s">%s</span>';

        switch(type) {
            case MESSAGE_TYPES.error:
                message_markup = message_markup.format('red', message);
                break;
            case MESSAGE_TYPES.info:
                message_markup = message_markup.format('grey', message);
                break;
            case MESSAGE_TYPES.success:
                message_markup = message_markup.format('green', message);
                break;
            default:
                message_markup = message_markup.format('grey', message);
        }

        return message_markup;
    },

    get text() {
        return this._text;
    },

    get markup() {
        return this._markup;
    },

    get type() {
        return this._type;
    },

    get timeout() {
        return this._timeout;
    },

    get has_spinner() {
        return this._has_spinner;
    }
});

const StatusBar = new Lang.Class({
    Name: 'StatusBar',

    _init: function(params) {
        this.params = Params.parse(params, {
            style_class: 'statusbar-box'
        });
        this.actor = new St.BoxLayout({
            style_class: this.params.style_class,
            visible: false
        });
        this._message_label = new St.Label();
        this._message_label.get_clutter_text().use_markup = true;
        let spinner_icon = Gio.File.new_for_uri(
            'resource:///org/gnome/shell/theme/process-working.svg'
        );
        this._spinner = new Animation.AnimatedIcon(spinner_icon, 24);

        this.actor.add(this._spinner.actor);
        this.actor.add(this._message_label);

        this._messages = {};
    },

    _get_max_id: function() {
        let max_id = Math.max.apply(Math, Object.keys(this._messages));
        let result = max_id > 0 ? max_id : 0;
        return result;
    },

    _generate_id: function() {
        let max_id = this._get_max_id();
        let result = max_id > 0 ? (max_id + 1) : 1;
        return result;
    },

    show_message: function(id) {
        let message = this._messages[id];
        if(message === undefined || !message instanceof StatusBarMessage) return;

        this._message_label.get_clutter_text().set_markup(message.markup);

        this.actor.opacity = 0;
        this.actor.show();

        if(message.has_spinner) {
            this._spinner.actor.show();
            this._spinner.play();
        }
        else {
            this._spinner.stop();
            this._spinner.actor.hide();
        }

        Tweener.addTween(this.actor, {
            time: 0.3,
            opacity: 255,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                let timeout = parseInt(message.timeout, 10);

                if(timeout > 0) {
                    Mainloop.timeout_add(message.timeout,
                        Lang.bind(this, function() {
                            this.remove_message(id);
                        })
                    );
                }
            })
        });
    },

    hide_message: function(id) {
        if(this._message_label.visible != true) return;

        let message = this._messages[id];
        if(message === undefined || !message instanceof StatusBarMessage) return;

        Tweener.addTween(this.actor, {
            time: 0.3,
            opacity: 0,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this.actor.hide();
            })
        });
    },

    add_message: function(params) {
        if(Utils.is_blank(params.text)) return false;

        let message = new StatusBarMessage(params);

        let id = this._generate_id();
        this._messages[id] = message;
        this.show_message(id);

        return id;
    },

    remove_message: function(id) {
        this._spinner.stop();
        this.hide_message(id);
        delete this._messages[id];
        this.show_last();
    },

    remove_last: function() {
        let max_id = this._get_max_id();
        if(max_id > 0) this.remove_message(max_id);
    },

    show_last: function() {
        let max_id = this._get_max_id();
        if(max_id > 0) this.show_message(max_id);
    },

    clear: function() {
        this.actor.hide();
        this._messages = {};
    },

    destroy: function() {
        this.clear();
        this.actor.destroy();
    }
});
