const St = imports.gi.St;
const Lang = imports.lang;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const Panel = imports.ui.panel;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const PopupDialog = Me.imports.popup_dialog;
const LinkPreviewers = Me.imports.link_previewers;

const URI_TYPES = {
    PATH: 0,
    URL: 1,
    NOTE: 2,
    UNDEFINED: 3
};

const StatusBox = new Lang.Class({
    Name: 'StatusBox',

    _init: function() {
        this.actor = new St.BoxLayout();

        this._label = new St.Label({
            text: 'Loading...'
        });
        this._spinner = new Panel.AnimatedIcon(
            global.datadir + '/theme/process-working.svg',
            24
        );

        this.actor.add_child(this._spinner.actor);
        this.actor.add_child(this._label);
        this.actor.hide();
    },

    show: function() {
        this._spinner.play();
        this.actor.show();
    },

    hide: function() {
        this._spinner.stop();
        this.actor.hide();
    },

    destroy: function() {
        this.actor.destroy();
    }
});

const LinkPreviewDialog = new Lang.Class({
    Name: 'LinkPreviewDialog',
    Extends: PopupDialog.PopupDialog,

    _init: function() {
        this.parent();

        this._box = new St.BoxLayout({
            style_class: 'note-links-preview-dialog'
        });
        this._status_box = new StatusBox();
        this._box.add_child(this._status_box.actor);
        this._previewer = null;
        this.actor.add_child(this._box);
        this.actor.z_position = 0.1;

        this.connect('hided', Lang.bind(this, this.clear));
    },

    _on_captured_event: function(object, event) {
        if(event.type() === Clutter.EventType.MOTION) {
            this._reposition();
        }

        this.parent(object, event);
    },

    _reposition: function() {
        let [x, y] = global.get_pointer();

        let cursor_indent = 10;
        let margin = 20;

        let offset_x = 10;
        let offset_y = 10;

        let monitor = Main.layoutManager.primaryMonitor;
        let available_width = monitor.width - x - cursor_indent - margin;
        let available_height = monitor.height - y - cursor_indent - margin;

        if(this.actor.width > available_width) {
            offset_x = monitor.width - (this.actor.width + x + margin);
        }
        if(this.actor.height > available_height) {
            offset_y = monitor.height - (this.actor.height + y + margin);
        }

        let dialog_x = x + cursor_indent + offset_x;
        let dialog_y = y + cursor_indent + offset_y;

        if(x > dialog_x && y > dialog_y) {
            dialog_x = x - this.actor.width - cursor_indent;
        }

        this.actor.x = dialog_x;
        this.actor.y = dialog_y;
    },

    _is_url: function(str) {
        let url_regexp = imports.misc.util._urlRegexp;
        return str.match(url_regexp) !== null;
    },

    _get_uri_for_note_link: function(link) {
        let uri, type;

        if(Utils.get_client().is_valid_uri(link)) {
            uri = link;
            type = URI_TYPES.NOTE;
        }
        else if(this._is_url(link)) {
            type = URI_TYPES.URL;

            if(link.indexOf(':') === -1) {
                uri = 'http://' + link;
            }
            else {
                uri = link;
            }
        }
        else if(Utils.starts_with(link, '/') || Utils.starts_with(link, '~')) {
            link = Utils.expand_path(link);
            uri = 'file://' + link;
            type = URI_TYPES.PATH;
        }
        else {
            uri = link;
            type = URI_TYPES.UNDEFINED;
        }

        return [uri, type];
    },

    _preview_file: function(uri, uri_type) {
        function on_query_complete(object, res) {
            let info;

            try {
                info = object.query_info_finish(res);
            }
            catch(e) {
                log('LinkPreviewDialog:_preview_file(): %s'.format(e));
                return;
            }

            let content_type = info.get_content_type();
            let thumbnail_path = info.get_attribute_byte_string('thumbnail::path');
            let previewer;

            if(
                Utils.starts_with(content_type, 'image')
                && Utils.SETTINGS.get_boolean(PrefsKeys.PREVIEW_IMAGES_KEY)
            ) {
                let size = info.get_size();
                let dont_preview_local =
                    uri_type === URI_TYPES.PATH
                    && Utils.SETTINGS.get_int(
                        PrefsKeys.PREVIEW_MAX_LOCAL_SIZE_KB_KEY
                    ) !== 0
                    && size > Utils.SETTINGS.get_int(
                        PrefsKeys.PREVIEW_MAX_LOCAL_SIZE_KB_KEY
                    ) * 1024;
                let dont_preview_net =
                    uri_type === URI_TYPES.URL
                    && Utils.SETTINGS.get_int(
                        PrefsKeys.PREVIEW_MAX_NET_SIZE_KB_KEY
                    ) !== 0
                    && size > Utils.SETTINGS.get_int(
                        PrefsKeys.PREVIEW_MAX_NET_SIZE_KB_KEY
                    ) * 1024;
                if(dont_preview_local) return;
                else if(dont_preview_net) return;
                else previewer = LinkPreviewers.ImagePreviewer;
            }
            else if(
                content_type === 'text/html'
                && Utils.SETTINGS.get_boolean(PrefsKeys.PREVIEW_WEBPAGES_KEY)
            ) {
                previewer = LinkPreviewers.WebpagePreviewer;
            }
            else if(
                !Utils.starts_with(content_type, 'image')
                && content_type !== 'text/html'
                && thumbnail_path !== null
                && Utils.SETTINGS.get_boolean(PrefsKeys.PREVIEW_FILES_KEY)
            ) {
                uri = 'file://' + thumbnail_path;
                previewer = LinkPreviewers.ImagePreviewer;
            }
            else {
                previewer = LinkPreviewers.NoPreviewer;
            }

            this._show_previewer(uri, previewer);
        }

        let file = Gio.file_new_for_uri(uri);
        file.query_info_async(
            'standard::content-type,standard::size,thumbnail::path',
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            null,
            Lang.bind(this, on_query_complete)
        );
    },

    _show_previewer: function(uri, previewer) {
        if(this._previewer !== null) this.clear();

        this._previewer = new previewer(uri, {
            max_width: Utils.SETTINGS.get_int(PrefsKeys.PREVIEW_MAX_WIDTH_KEY),
            max_height: Utils.SETTINGS.get_int(PrefsKeys.PREVIEW_MAX_HEIGHT_KEY)
        });
        this.show();
        this._status_box.show();
        this._previewer.load(Lang.bind(this, function(ok) {
            if(ok !== true) {
                this.hide();
                return;
            }

            this._status_box.hide();
            this._box.add_child(this._previewer.actor);
            this._reposition();
        }));
    },

    preview: function(link) {
        link = link.trim();
        let [uri, type] = this._get_uri_for_note_link(link);

        if(
            type === URI_TYPES.NOTE
            && Utils.SETTINGS.get_boolean(PrefsKeys.PREVIEW_NOTES_KEY)
        ) {
            this._show_previewer(uri, LinkPreviewers.NotePreviewer);
        }
        else if(type === URI_TYPES.UNDEFINED) {
            this._show_previewer(uri, LinkPreviewers.NoPreviewer);
        }
        else if(type !== URI_TYPES.NOTE) {
            if(
                Utils.SETTINGS.get_boolean(PrefsKeys.PREVIEW_ONLY_LOCAL_KEY)
                && type === URI_TYPES.URL
            ) {
                this._show_previewer(uri, LinkPreviewers.NoPreviewer);
            }
            else {
                this._preview_file(uri, type);
            }
        }
    },

    clear: function() {
        if(this._previewer !== null) {
            this._previewer.destroy();
            this._previewer = null;
        }

        this._status_box.hide();
    },

    hide: function() {
        this.parent();
    }
});
