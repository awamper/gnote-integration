const St = imports.gi.St;
const Lang = imports.lang;
const Params = imports.misc.params;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const NotePreviewerContentView = Me.imports.note_previewer_content_view;
const GnoteNote = Me.imports.gnote_note;

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

const NoPreviewer = new Lang.Class({
    Name: 'NoPreviewer',
    Extends: LinkPreviewerBase,

    _init: function(uri, params) {
        this.parent(uri, params);
    },

    load: function(on_loaded) {
        let label = new St.Label({
            text: 'No preview'
        });
        this.actor.add_child(label);
        on_loaded();
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
                on_loaded();
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
            this.params.max_height
        );
        image.connect("size-change", Lang.bind(this, on_loaded));
        this.actor.add_child(image);
    }
});
