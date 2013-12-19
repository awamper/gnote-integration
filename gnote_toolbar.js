const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const ButtonsBar = Me.imports.buttons_bar;

const GnoteToolbar = new Lang.Class({
    Name: "GnoteToolbar",

    _init: function(gnote_integration) {
        this._gnote_integration = gnote_integration;
        this._statusbar = this._gnote_integration._statusbar;

        this._buttons_bar = new ButtonsBar.ButtonsBar();
        this._init_gnote_button();
        this._init_prefs_button();
    },

    _init_gnote_button: function() {
        let button_params = {
            icon_name: Utils.ICONS.INDICATOR,
            label_text: '',
            tip_text: 'Open editor',
            button_style_class: 'gnote-button',
            statusbar: this._statusbar,
            action: Lang.bind(this, function() {
                let search_text = this._gnote_integration.search_text;

                if(!Utils.is_blank(search_text)) {
                    Utils.get_client().display_search_with_text(
                        search_text
                    );
                }
                else {
                    Utils.get_client().display_search();
                }

                this._gnote_integration.hide(false);
            })
        };
        this._gnote_btn = new ButtonsBar.ButtonsBarButton(button_params);
        this._buttons_bar.add_button(this._gnote_btn);
    },

    _init_prefs_button: function() {
        let button_params = {
            icon_name: Utils.ICONS.PREFERENCES,
            label_text: '',
            tip_text: 'Preferences',
            button_style_class: 'gnote-button',
            statusbar: this._statusbar,
            action: Lang.bind(this, function() {
                Utils.launch_extension_prefs(Me.uuid);
                this._gnote_integration.hide(false);
            })
        };
        this._prefs_btn = new ButtonsBar.ButtonsBarButton(button_params);
        this._buttons_bar.add_button(this._prefs_btn);
    },

    get actor() {
        return this._buttons_bar.actor;
    },

    get clear_btn() {
        return this._clear_btn;
    },

    get prefs_btn() {
        return this._prefs_btn;
    }
});
