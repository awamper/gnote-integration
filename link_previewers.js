const St = imports.gi.St;
const Lang = imports.lang;
const Pango = imports.gi.Pango;
const Params = imports.misc.params;
const Main = imports.ui.main;
const Soup = imports.gi.Soup;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const NotePreviewerContentView = Me.imports.note_previewer_content_view;
const GnoteNote = Me.imports.gnote_note;

const SCALE_FACTOR = St.ThemeContext.get_for_stage(global.stage).scale_factor;

const LinkPreviewerBase = new Lang.Class({
    Name: 'LinkPreviewerBase',

    _init: function(uri, params) {
        let monitor = Main.layoutManager.primaryMonitor;
        this.params = Params.parse(params, {
            max_width: Math.floor(monitor.width / 2),
            max_height: Math.floor(monitor.height / 2)
        });
        this.uri = uri;
        this.actor = new St.BoxLayout();
    },

    load: function(on_loaded) {
        throw new Error('not implemented');
    },

    destroy: function() {
        this.actor.destroy();
    }
});

const NotePreviewer = new Lang.Class({
    Name: 'NotePreviewer',
    Extends: LinkPreviewerBase,

    _init: function(uri, params) {
        this.parent(uri, params);

        this._content_view = new NotePreviewerContentView.NotePreviewerContentView();
        this.actor.add_child(this._content_view.actor);

        this.actor.connect('notify::mapped', Lang.bind(this, function() {
            if(!this.actor.mapped) return;
            
            if(this.actor.width > this.params.max_width) {
                this.actor.width = this.params.max_width;
            }
            if(this.actor.height > this.params.max_height) {
                this.actor.height = this.params.max_height;
            }
        }))
    },

    load: function(on_loaded) {
        let note = new GnoteNote.GnoteNote(this.uri);
        note.connect(
            'notify::parsed',
            Lang.bind(this, function() {
                this._content_view.set_note(note);
                this._content_view.show();
                on_loaded(true);
            })
        );
        note.start_parsing();
    },

    destroy: function() {
        this._content_view.destroy();
        this.parent();
    }
});

const ImagePreviewer = new Lang.Class({
    Name: 'ImagePreviewView',
    Extends: LinkPreviewerBase,

    _init: function(uri, params) {
        this.parent(uri, params);
    },

    load: function(on_loaded) {
        let texture_cache = St.TextureCache.get_default();
        let image = texture_cache.load_uri_async(
            this.uri,
            this.params.max_width,
            this.params.max_height,
            SCALE_FACTOR
        );
        image.connect("size-change",
            Lang.bind(this, function() {
                on_loaded(true);
            })
        );
        this.actor.add_child(image);
    }
});

const WebpagePreviewerView = new Lang.Class({
    Name: 'WebpagePreviewerView',

    _init: function(webpage_data) {
        if(this._is_empty_data(webpage_data)) {
            throw new Error('WebpagePreviewerView:_init(): empty webpage_data');
        }

        this._image_max_width = 350;
        this._image_max_height = 200;
        this._max_string_length = 50;

        this.actor = new St.BoxLayout({
            vertical: true,
            style_class: 'dialog-note-view-box dialog-note-view-contents'
        });
        this.actor.connect('destroy', Lang.bind(this, this.destroy));

        if(webpage_data.title !== null) {
            let title = new St.Label({
                text: Utils.wordwrap(
                    webpage_data.title,
                    this._max_string_length,
                    '\n'
                ),
                style: 'font-weight: bold; font-size: 17px;'
            });
            title.clutter_text.set_single_line_mode(false);
            title.clutter_text.set_activatable(false);

            this.actor.add_child(title);
        }
        if(webpage_data.images.length > 0) {
            let image_info = webpage_data.images[0];

            let image_dummy = new St.Icon({
                icon_name: "camera-photo-symbolic",
                icon_size: 120
            });
            this.actor.add_child(image_dummy);

            let texture_cache = St.TextureCache.get_default();
            let image = texture_cache.load_uri_async(
                image_info.url,
                this._image_max_width,
                this._image_max_height,
                SCALE_FACTOR
            );
            image.connect("size-change",
                Lang.bind(this, function(o, e) {
                    image_dummy.destroy();
                })
            );

            this.actor.add(image, {
                x_expand: false,
                x_fill: false,
                y_expand: false,
                y_fill: false
            });
        }
        if(webpage_data.description !== null) {
            let description = new St.Label({
                text: Utils.wordwrap(
                    webpage_data.description,
                    this._max_string_length,
                    '\n'
                )
            });
            description.clutter_text.set_single_line_mode(false);
            description.clutter_text.set_activatable(false);

            this.actor.add_child(description);
        }
    },

    _is_empty_data: function(data) {
        return
            data.images.length === 0
            && data.title === null
            && data.description === null;
    },

    destroy: function() {
        this.actor.destroy();
    }
});

const WebpagePreviewer = new Lang.Class({
    Name: 'WebpagePreviewer',
    Extends: LinkPreviewerBase,

    _init: function(uri, params) {
        this.parent(uri, params);

        this._http_session = new Soup.SessionAsync();
        Soup.Session.prototype.add_feature.call(
            this._http_session,
            new Soup.ProxyResolverDefault()
        );
        this._http_session.user_agent = 'GNOME Shell - Gnote/Tomboy Integration';
        this._http_session.timeout = 10;
    },

    load: function(on_loaded) {
        let api_key = Utils.SETTINGS.get_string(PrefsKeys.EMBEDLY_API_KEY_KEY);
        let api_url = Utils.SETTINGS.get_string(PrefsKeys.EMBEDLY_API_URL_KEY);

        if(Utils.is_blank(api_key) || Utils.is_blank(api_url)) {
            on_loaded(false);
            return;
        }

        let url ='%s?key=%s&url=%s'.format(api_url, api_key, this.uri);
        let request = Soup.Message.new('GET', url);
        this._http_session.queue_message(request,
            Lang.bind(this, function(http_session, message) {
                if(message.status_code !== 200) {
                    log('WebpagePreviewer:load():Response code %s'.format(
                        message.status_code)
                    );
                    on_loaded(false);
                    return;
                }

                try {
                    let result = JSON.parse(request.response_body.data);
                    let view = new WebpagePreviewerView(result);
                    this.actor.add_child(view.actor);
                    on_loaded(true);
                }
                catch(e) {
                    log('WebpagePreviewer:load():%s'.format(e));
                    on_loaded(false);
                    return;
                }
            })
        );
    }
});

const MessagePreviewer = new Lang.Class({
    Name: 'MessagePreviewer',
    Extends: LinkPreviewerBase,

    _init: function(message, params) {
        this.parent(null, params);
        this._message = message;
    },

    load: function(on_loaded) {
        let label = new St.Label({
            text: this._message
        });
        this.actor.add_child(label);
        on_loaded(true);
    }
});
