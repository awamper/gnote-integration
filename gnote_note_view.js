const St = imports.gi.St;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const Pango = imports.gi.Pango;
const ExtensionUtils = imports.misc.extensionUtils;
const Tweener = imports.ui.tweener;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const GnoteNote = Me.imports.gnote_note;

const ANIMATION_TIMES = {
    BOX: 0.5,
    LABEL: 0.5
};
const MIN_SCALE = 0.2;

const LINK_TYPES = {
    URL: 0,
    NOTE: 1
};

const GnoteNoteView = new Lang.Class({
    Name: 'GnoteNoteView',

    _init: function(replaced_actor) {
        this._replaced_actor = replaced_actor;

        this.actor = new St.BoxLayout({
            style_class: 'gnote-note-view-box',
            vertical: true,
            reactive: true
        });
        this.actor.set_pivot_point(0.5, 0.5);

        this._contents_label = new St.Entry({
            text: '...',
            style_class: 'gnote-note-view-contents',
            reactive: true
        });
        this._contents_label.clutter_text.set_single_line_mode(false);
        this._contents_label.clutter_text.set_activatable(false);
        this._contents_label.clutter_text.set_line_wrap(true);
        this._contents_label.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD);
        this._contents_label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
        this._contents_label.connect(
            'motion-event',
            Lang.bind(this, function(o, e) {
                let [x, y] = e.get_coords();
                let url = this._find_url_at_coords(x, y);

                if(url !== -1) {
                    global.set_cursor(Shell.Cursor.POINTING_HAND);
                }
                else {
                    global.unset_cursor();
                }
            })
        );
        this._contents_label.connect(
            'enter-event',
            Lang.bind(this, function(o, e) {
                this._contents_label.clutter_text.set_editable(true);
            })
        );
        this._contents_label.connect(
            'leave-event',
            Lang.bind(this, function(o, e) {
                global.unset_cursor();
            })
        );
        this._contents_label.connect(
            'key-press-event',
            Lang.bind(this, function(o, e) {
                let symbol = e.get_key_symbol();

                if(symbol === Clutter.BackSpace || symbol === Clutter.Escape) {
                    this.hide();
                    this._replaced_actor.grab_key_focus();
                    return true;
                }

                return true;
            })
        );
        this._contents_label.clutter_text.connect(
            'button-release-event',
            Lang.bind(this, function(o, e) {
                let button = e.get_button();
                let [x, y] = e.get_coords();
                let url = this._find_url_at_coords(x, y)

                if(button !== Clutter.BUTTON_PRIMARY) {
                    return false;
                }

                if(url === -1) {
                    this._contents_label.clutter_text.set_editable(true);
                }
                else if(url.type === LINK_TYPES.URL) {
                    this._contents_label.clutter_text.set_editable(false);
                    this.emit('url-clicked', url.url);
                }
                else if(url.type === LINK_TYPES.NOTE){
                    this._contents_label.clutter_text.set_editable(false);
                    this.emit('note-clicked', url.url);
                }

                return false;
            }));
        this._contents_label.clutter_text.connect(
            'key-press-event',
            Lang.bind(this, function(o, e) {
                let symbol = e.get_key_symbol();

                if(symbol === Clutter.BackSpace || symbol === Clutter.Escape) {
                    this.hide();
                    return true;
                }

                return false;
            })
        );

        let contents_box = new St.BoxLayout({
            vertical: true
        });
        this._scroll = new St.ScrollView({
            style_class: 'gnote-note-view-scrollbox'
        });
        contents_box.add_actor(this._contents_label);
        this._scroll.add_actor(contents_box);

        this.actor.add_child(this._scroll);
        this.actor.hide();

        this._note = null;
        this.showed = false;
    },

    _find_url_at_coords: function(x, y) {
        let result = -1;
        let clutter_text = this._contents_label.clutter_text;
        [success, x, y] = this._contents_label.transform_stage_point(x, y);

        for each(let url in this._note.urls) {
            let [success, url_x, url_y, line_height] =
                clutter_text.position_to_coords(url.start_pos);
            let [end_success, end_url_x, end_url_y, end_line_height] =
                clutter_text.position_to_coords(url.end_pos);

            if(
                url_y > y
                || url_y + line_height < y
                || x < url_x
                || x > url_x + end_url_x
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

    _set_markup: function(markup, animation) {
        if(!animation) {
            this._contents_label.clutter_text.set_markup(markup);
            this._scroll.vscroll.adjustment.value = 0;
            return;
        }

        Tweener.removeTweens(this._contents_label);
        Tweener.addTween(this._contents_label, {
            time: ANIMATION_TIMES.LABEL / 2 / St.get_slow_down_factor(),
            opacity: 50,
            transition:'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this._contents_label.clutter_text.set_markup(markup);
                this._scroll.vscroll.adjustment.value = 0;
                Tweener.addTween(this._contents_label, {
                    time: ANIMATION_TIMES.LABEL / 2 / St.get_slow_down_factor(),
                    opacity: 255,
                    transition: 'easeOutQuad'
                });
            })
        });
    },

    load_note: function(uri) {
        this._contents_label.clutter_text.set_editable(false);
        this._note = new GnoteNote.GnoteNote(uri);
        this._note.connect(
            'notify::parsed',
            Lang.bind(this, function() {
                let markup = this._note.title_markup + '\n\n' + this._note.markup;
                this._set_markup(markup, !this.is_empty);
            })
        );
        this._note.start_parsing();
    },

    clear: function() {
        this._contents_label.set_text('...');
    },

    show: function() {
        if(this.showed) return;

        this.showed = true;
        let animation = Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY);

        if(!animation) {
            this._replaced_actor.hide();
            this.actor.opacity = 255;
            this.actor.show();
            this.grab_key_focus();
            return;
        }

        Tweener.removeTweens(this._replaced_actor);
        Tweener.addTween(this._replaced_actor, {
            opacity: 0,
            scale_y: MIN_SCALE,
            scale_x: MIN_SCALE,
            time: ANIMATION_TIMES.BOX / St.get_slow_down_factor(),
            transition: 'easeOutQuad'
        });

        this.actor.set_scale(MIN_SCALE, MIN_SCALE);
        this.actor.opacity = 0;
        this.actor.show();
        Tweener.removeTweens(this.actor)
        Tweener.addTween(this.actor, {
            scale_x: 1,
            scale_y: 1,
            opacity: 255,
            time: ANIMATION_TIMES.BOX / St.get_slow_down_factor(),
            transition: 'easeOutQuad'
        });

        this.grab_key_focus();
    },

    hide: function() {
        if(!this.showed) return;

        this.showed = false;
        let animation = Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY);

        if(!animation) {
            this.actor.hide();
            this.clear();
            this._replaced_actor.opacity = 255;
            this._replaced_actor.show();
            this._replaced_actor.grab_key_focus();
            return;
        }

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            opacity: 0,
            scale_y: MIN_SCALE,
            scale_x: MIN_SCALE,
            time: ANIMATION_TIMES.BOX / St.get_slow_down_factor(),
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this.actor.hide();
                this.clear();
            })
        });

        this._replaced_actor.opacity = 0;
        this._replaced_actor.set_scale(MIN_SCALE, MIN_SCALE);
        Tweener.removeTweens(this._replaced_actor);
        Tweener.addTween(this._replaced_actor, {
            time: ANIMATION_TIMES.BOX / St.get_slow_down_factor(),
            opacity: 255,
            scale_x: 1,
            scale_y: 1,
            transition: 'easeOutQuad'
        });

        this._replaced_actor.grab_key_focus();
    },

    destroy: function() {
        this._client.destroy();
        this.actor.destroy();
    },

    grab_key_focus: function() {
        this._contents_label.grab_key_focus();
    },

    get is_empty() {
        return this._contents_label.text === '...';
    }
});
Signals.addSignalMethods(GnoteNoteView.prototype);
