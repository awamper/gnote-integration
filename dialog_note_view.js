const St = imports.gi.St;
const Lang = imports.lang;
const Pango = imports.gi.Pango;
const Clutter = imports.gi.Clutter;
const Tweener = imports.ui.tweener;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const NoteContentView = Me.imports.note_content_view;
const Shared = Me.imports.shared;

const CONNECTION_IDS = {
    CONTENT_SIZE: 0,
    TITLE_SIZE: 0
};

const ANIMATION_TIMES = {
    BOX: 0.5
};

const MIN_SCALE = 0.2;

const DialogNoteViewToolbar = new Lang.Class({
    Name: 'DialogNoteViewToolbar',

    _init: function() {
        this.actor = new St.BoxLayout({
            style_class: 'dialog-note-view-toolbar-box'
        });

        this.search_all_btn = new St.Button({
            label: 'Search all',
            style_class: 'dialog-note-view-toolbar-button'
        });
        this.open_btn = new St.Button({
            label: 'Open',
            style_class: 'dialog-note-view-toolbar-button'
        });
        this.delete_btn = new St.Button({
            label: 'Delete',
            style_class: 'dialog-note-view-toolbar-button'
        });

        this.actor.add_child(this.search_all_btn);
        this.actor.add_child(this.open_btn);
        this.actor.add_child(this.delete_btn);
    },

    destroy: function() {
        this.actor.destroy();
    }
});

const DialogNoteView = new Lang.Class({
    Name: 'DialogNoteView',
    Extends: NoteContentView.NoteContentView,

    _init: function(replaced_actor) {
        let params = {
            actor_style: 'dialog-note-view-box',
            content_style: 'dialog-note-view-contents',
            scroll_style: 'dialog-note-view-scrollbox',
            content_size: Utils.SETTINGS.get_int(
                PrefsKeys.NOTE_CONTENTS_SIZE_KEY
            ),
            change_cursor_on_links: true
        };
        this.parent(params);

        this._toolbar = new DialogNoteViewToolbar();
        this._toolbar.search_all_btn.connect('clicked',
            Lang.bind(this, this.hide)
        );
        this._toolbar.open_btn.connect('clicked',
            Lang.bind(this, this._open_note)
        );
        this._toolbar.delete_btn.connect('clicked',
            Lang.bind(this, this._delete_note)
        );
        this.actor.insert_child_at_index(this._toolbar.actor, 0);

        this._title_label = new St.Label({
            style_class: params.content_style,
            text: '...'
        });
        this._title_label.clutter_text.set_single_line_mode(false);
        this._title_label.clutter_text.set_activatable(false);
        this._title_label.clutter_text.set_line_wrap(true);
        this._title_label.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD);
        this._title_label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
        this.contents_box.insert_child_at_index(this._title_label, 0);

        this._replaced_actor = replaced_actor;
        this.showed = false;
        this.title_size = Utils.SETTINGS.get_int(PrefsKeys.NOTE_TITLE_SIZE_KEY);
        this.actor.hide();

        CONNECTION_IDS.CONTENT_SIZE = Utils.SETTINGS.connect(
            'changed::' + PrefsKeys.NOTE_CONTENTS_SIZE_KEY,
            Lang.bind(this, function() {
                this.content_size = Utils.SETTINGS.get_int(
                    PrefsKeys.NOTE_CONTENTS_SIZE_KEY
                );
            })
        );
        CONNECTION_IDS.TITLE_SIZE = Utils.SETTINGS.connect(
            'changed::' + PrefsKeys.NOTE_TITLE_SIZE_KEY,
            Lang.bind(this, function() {
                this.title_size = Utils.SETTINGS.get_int(
                    PrefsKeys.NOTE_TITLE_SIZE_KEY
                );
            })
        );

        this.contents_label.connect('captured-event',
            Lang.bind(this, this._on_captured_event)
        );
    },

    _on_captured_event: function(o, e) {
        if(e.type() === Clutter.EventType.BUTTON_PRESS) {
            this.contents_label.clutter_text.set_editable(true);
            return false;
        }
        else if(e.type() === Clutter.EventType.LEAVE) {
            this.contents_label.clutter_text.set_selection(0, 0);
            this.contents_label.clutter_text.set_editable(false);
            global.unset_cursor();
            return false;
        }
        else if(e.type() === Clutter.EventType.KEY_PRESS) {
            return true;
        }
        else if(e.type() === Clutter.EventType.KEY_RELEASE) {
            if(e.has_control_modifier()) return true;

            let symbol = e.get_key_symbol();
            let ch = Utils.get_unichar(symbol);
            let enter =
                symbol === Clutter.Return
                || symbol === Clutter.KP_Enter;
            let control =
                symbol === Clutter.KEY_Control_L
                || symbol === Clutter.KEY_Control_R;

            if(symbol === Clutter.BackSpace || symbol === Clutter.Escape) {
                this.hide();
                return true;
            }
            else if(control) {
                return true;
            }
            else if(enter) {
                this._open_note();
                return true;
            }
            else if(symbol === Clutter.Delete) {
                this._delete_note();
                return true;
            }
            else if(ch) {
                return true;
            }
            else if(symbol === Clutter.Up) {
                this._scroll_step_up();
                return true;
            }
            else if (symbol === Clutter.Down) {
                this._scroll_step_down();
                return true;
            }
            else {
                return true;
            }
        }
        else {
            return false;
        }
    },

    _delete_note: function() {
        this.hide();
        Shared.gnote_integration.delete_note(this._note.uri);
    },

    _open_note: function() {
        Utils.get_client().display_note(this._note.uri);
        this.hide(false);
        Shared.gnote_integration.hide(false);
    },

    _scroll_step_up: function() {
        let value = this.scroll.vscroll.adjustment.value;
        let step_increment = this.scroll.vscroll.adjustment.step_increment;
        
        if(value > 0) {
            this.scroll.vscroll.adjustment.value = value - step_increment;
        }
    },

    _scroll_step_down: function() {
        let value = this.scroll.vscroll.adjustment.value;
        let step_increment = this.scroll.vscroll.adjustment.step_increment;
        let upper = this.scroll.vscroll.adjustment.upper;
        
        if(value < upper) {
            this.scroll.vscroll.adjustment.value = value + step_increment;
        }
    },

    set_note: function(note) {
        this.parent(note);
        this.set_title(this._note.title);
    },

    set_title: function(title) {
        this._title_label.set_text(title + '\n');
    },

    show: function(animation) {
        if(this.showed) return;

        this.showed = true;
        animation =
            animation !== undefined
            ? animation
            : Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY);

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

    hide: function(animation) {
        if(!this.showed) return;

        this.contents_label.clutter_text.set_selection(0, 0);
        this.showed = false;
        animation =
            animation !== undefined
            ? animation
            : Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY);

        if(!animation) {
            this.actor.hide();
            this.clear();
            this._replaced_actor.set_scale(1, 1);
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

    grab_key_focus: function() {
        this._contents_label.grab_key_focus();
    },

    destroy: function() {
        if(CONNECTION_IDS.CONTENT_SIZE !== 0) {
            Utils.SETTINGS.disconnect(CONNECTION_IDS.CONTENT_SIZE);
            CONNECTION_IDS.CONTENT_SIZE = 0;
        }
        if(CONNECTION_IDS.TITLE_SIZE !== 0) {
            Utils.SETTINGS.disconnect(CONNECTION_IDS.TITLE_SIZE);
            CONNECTION_IDS.TITLE_SIZE = 0;
        }

        this._toolbar.destroy();
        this.parent();
    },

    set title_size(size) {
        this._title_size = size;
        this._title_label.style = 'font-size: %spx'.format(size);
    },

    get title_size() {
        return this._title_size;
    }
});
