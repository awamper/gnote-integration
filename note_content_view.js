const St = imports.gi.St;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Clutter = imports.gi.Clutter;
const Pango = imports.gi.Pango;
const Signals = imports.signals;
const Params = imports.misc.params;
const Tweener = imports.tweener.tweener;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const GnoteNote = Me.imports.gnote_note;

const ANIMATION_TIMES = {
    LABEL: 0.5
};

const NoteContentView = new Lang.Class({
    Name: 'NoteContentView',

    _init: function(params) {
        this.params = Params.parse(params, {
            actor_style: '',
            content_style: '',
            scroll_style: '',
            content_size: 15,
            change_cursor_on_links: true,
            track_links_hover: false
        });

        this.actor = new St.BoxLayout({
            style_class: this.params.actor_style,
            vertical: true,
            reactive: true
        });
        this.actor.set_pivot_point(0.5, 0.5);

        if(this.params.change_cursor_on_links || this.params.track_links_hover) {
            this.actor.connect('leave-event',
                Lang.bind(this, function() {
                    global.screen.set_cursor(Meta.Cursor.DEFAULT);

                    if(this._url_entered) {
                        this._url_entered = null;
                        this.emit('link-leave');
                    }
                })
            );
        }

        this._contents_label = new St.Entry({
            text: '...',
            style_class: this.params.content_style,
            reactive: true
        });
        this._contents_label.clutter_text.set_single_line_mode(false);
        this._contents_label.clutter_text.set_activatable(false);
        this._contents_label.clutter_text.set_editable(false);
        this._contents_label.clutter_text.set_line_wrap(true);
        this._contents_label.clutter_text.set_line_wrap_mode(
            Pango.WrapMode.WORD
        );
        this._contents_label.clutter_text.set_ellipsize(
            Pango.EllipsizeMode.NONE
        );

        if(this.params.change_cursor_on_links || this.params.track_links_hover) {
            this._contents_label.connect(
                'motion-event',
                Lang.bind(this, this._on_motion_event)
            );
        }

        this._contents_label.clutter_text.connect(
            'button-release-event',
            Lang.bind(this, this._on_text_button_release_event)
        );

        this.contents_box = new St.BoxLayout({
            vertical: true
        });
        this.contents_box.add_actor(this._contents_label);

        this.scroll = new St.ScrollView({
            style_class: this.params.scroll_style
        });
        this.scroll.add_actor(this.contents_box);

        this.actor.add_actor(this.scroll);

        this._url_entered = null;
        this._note = null;
        this.content_size = this.params.content_size;
    },

    _find_url_at_coords: function(x, y) {
        if(!this._note || this._note.urls.length < 1) return -1;

        let result = -1;
        let clutter_text = this._contents_label.clutter_text;
        [success, x, y] = this._contents_label.transform_stage_point(x, y);

        for each(let url in this._note.urls) {
            let [success, url_start_x, url_start_y, line_height] =
                clutter_text.position_to_coords(url.start_pos);
            let [end_success, url_end_x, url_end_y, end_line_height] =
                clutter_text.position_to_coords(url.end_pos);

            if(
                url_start_y > y
                || url_start_y + line_height < y
                || x < url_start_x
                || x > url_end_x
            ) {
                continue;
            }
            else {
                result = url;
                break;
            }
        }

        return result;
    },

    _on_motion_event: function(o, e) {
        let [x, y] = e.get_coords();
        let url = this._find_url_at_coords(x, y);

        if(url !== -1) {
            global.screen.set_cursor(Meta.Cursor.POINTING_HAND);
            if(!this.params.track_links_hover) return;

            if(this._url_entered === null) {
                this._url_entered = url;
                this.emit('link-enter', url);
            }
            else if(this._url_entered !== null && this._url_entered !== url) {
                this._url_entered = url;
                this.emit('link-leave');
                this.emit('link-enter', url);
            }
        }
        else {
            global.screen.set_cursor(Meta.Cursor.DEFAULT);
            if(!this.params.track_links_hover) return;

            if(this._url_entered) {
                this._url_entered = null;
                this.emit('link-leave');
            }
        }
    },

    _on_text_button_release_event: function(o, e) {
        let button = e.get_button();
        if(button !== Clutter.BUTTON_PRIMARY) return false;
        let [x, y] = e.get_coords();
        let url = this._find_url_at_coords(x, y)

        if(url === -1) {
            this._contents_label.clutter_text.set_editable(true);
        }
        else if(url.type === GnoteNote.LINK_TYPES.URL) {
            this._contents_label.clutter_text.set_editable(false);
            this.emit('url-clicked', url.url);
        }
        else if(url.type === GnoteNote.LINK_TYPES.NOTE){
            this._contents_label.clutter_text.set_editable(false);
            this.emit('note-clicked', url.url);
        }

        return false;
    },

    set_markup: function(markup, animation) {
        if(!animation) {
            this._contents_label.clutter_text.set_markup(markup);
            this.scroll.vscroll.adjustment.value = 0;
            return;
        }

        Tweener.removeTweens(this._contents_label);
        Tweener.addTween(this._contents_label, {
            time: ANIMATION_TIMES.LABEL / 2 / St.get_slow_down_factor(),
            opacity: 50,
            transition:'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this._contents_label.clutter_text.set_markup(markup);
                this.scroll.vscroll.adjustment.value = 0;
                Tweener.addTween(this._contents_label, {
                    time: ANIMATION_TIMES.LABEL / 2 / St.get_slow_down_factor(),
                    opacity: 255,
                    transition: 'easeOutQuad'
                });
            })
        });
    },

    set_note: function(note) {
        this._note = note;
        this._contents_label.clutter_text.set_editable(false);
        this.set_markup(this._note.markup, !this.is_empty);
    },

    clear: function() {
        this._contents_label.set_text('...');
    },

    destroy: function() {
        this.clear();
        this.actor.destroy();
    },

    get is_empty() {
        return this._contents_label.text === '...';
    },

    set content_size(size) {
        this._content_size = size;
        this._contents_label.style = 'font-size: %spx'.format(size);
    },

    get content_size() {
        return this._contents_label;
    },

    get contents_label() {
        return this._contents_label;
    }
});
Signals.addSignalMethods(NoteContentView.prototype);
