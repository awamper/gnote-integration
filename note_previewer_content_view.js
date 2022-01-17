const St = imports.gi.St;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Tweener = imports.tweener.tweener;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const NoteContentView = Me.imports.note_content_view;

const CONNECTION_IDS = {
    CAPTURED_EVENT: 0
};

const NotePreviewerContentView = new Lang.Class({
    Name: 'NotePreviewerContentView',
    Extends: NoteContentView.NoteContentView,

    _init: function() {
        let params = {
            actor_style: 'dialog-note-view-box',
            content_style: 'dialog-note-view-contents',
            scroll_style: 'dialog-note-view-scrollbox',
            content_size: Utils.SETTINGS.get_int(
                PrefsKeys.NOTE_CONTENTS_SIZE_KEY
            ),
            change_cursor_on_links: false
        };
        this.parent(params);

        this._showed = false;
        this.actor.hide();
    },

    _connect_captured_event: function() {
        CONNECTION_IDS.CAPTURED_EVENT = global.stage.connect(
            'captured-event',
            Lang.bind(this, this._on_captured_event)
        );
    },

    _disconnect_captured_event: function() {
        if(CONNECTION_IDS.CAPTURED_EVENT > 0) {
            global.stage.disconnect(CONNECTION_IDS.CAPTURED_EVENT);
            CONNECTION_IDS.CAPTURED_EVENT = 0;
        }
    },

    _on_captured_event: function(o, e) {
        if(e.type() === Clutter.EventType.SCROLL) {
            let direction = e.get_scroll_direction();

            if(direction === Clutter.ScrollDirection.UP) this._scroll_step_up();
            if(direction === Clutter.ScrollDirection.DOWN) this._scroll_step_down();

            return true;
        }

        return false;
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

    show: function() {
        if(this._showed) return;

        this._showed = true;
        this.actor.opacity = 0;
        this.actor.show();
        Tweener.removeTweens(this.actor)
        Tweener.addTween(this.actor, {
            opacity: 255,
            time: 0.3 / St.get_slow_down_factor(),
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, this._connect_captured_event)
        });
    },

    hide: function() {
        if(!this._showed) return;

        this._disconnect_captured_event();
        this._showed = false;
        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            opacity: 0,
            time: 0.5 / St.get_slow_down_factor(),
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this.actor.hide();
            })
        });
    },

    destroy: function() {
        this._disconnect_captured_event();
        this.parent();
    }
});
