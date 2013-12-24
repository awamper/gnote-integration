const St = imports.gi.St;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Clutter = imports.gi.Clutter;
const Tweener = imports.ui.tweener;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const DesktopNoteContainer = Me.imports.desktop_note_container;
const GnoteNote = Me.imports.gnote_note;
const PageIndicators = Me.imports.page_indicators;
const Shared = Me.imports.shared;

const ANIMATION_TIMES = {
    HIDE: 0.5,
    SHOW: 0.5
};
const IDS = {
    MONITORS_CHANGED: 0,
    OVERVIEW_SHOWING: 0,
    OVERVIEW_HIDDEN: 0,
    ENABLED_NOTES: 0,
    MAX_PAGES: 0,
    NOTE_DELETED: 0,
    NOTE_SAVED: 0
};
const DEFAULT_NOTE_PROPERTIES = {
    X: 0,
    Y: 0,
    WIDTH: 200,
    HEIGHT: 300,
    PAGE: 0,
    COLOR: 'rgba(64, 64, 64, 0.7)'
};

const DesktopNotes = new Lang.Class({
    Name: 'DesktopNotes',

    _init: function() {
        IDS.NOTE_DELETED = Utils.get_client().connect(
            'note-deleted',
            Lang.bind(this, function(client, uri, title) {
                if(this.is_note_on_desktop(uri)) {
                    this.remove_note(uri);
                }
            })
        );
        IDS.NOTE_SAVED = Utils.get_client().connect(
            'note-saved',
            Lang.bind(this, function(client, uri) {
                if(this.is_note_on_desktop(uri)) {
                    this.update_note(uri);
                }
            })
        );

        this.actor = new St.Table({
            homogeneous: false,
            reactive: true
        });
        this.actor.connect(
            'key-release-event',
            Lang.bind(this, this._on_key_release_event)
        );
        this.actor.connect(
            'scroll-event',
            Lang.bind(this, function(o, e) {
                let direction = e.get_scroll_direction();
                let modifier_state = e.get_state()
                
                if(modifier_state !== Clutter.ModifierType.BUTTON3_MASK) return false;

                if(direction === Clutter.ScrollDirection.UP) {
                    this.show_page(this._current_page_index - 1);
                    return true;
                }
                else if(direction === Clutter.ScrollDirection.DOWN) {
                    this.show_page(this._current_page_index + 1)
                    return true;
                }
                else {
                    return false;
                }
            })
        );
        this.set_background_color(0, 0, 0, 0);
        
        this._box = new St.BoxLayout();

        this._page_indicators = new PageIndicators.PageIndicators();
        this._page_indicators.set_n_pages(
            Utils.SETTINGS.get_int(PrefsKeys.DESKTOP_NOTES_MAX_PAGES)
        );
        this._page_indicators.set_current_page(0);
        this._page_indicators.connect(
            'page-activated',
            Lang.bind(this, function(o, index) {
                if(this._current_page_index === index) {
                    this._page_indicators.set_current_page(index);
                    return;
                }

                this.show_page(index);
            })
        );

        this.actor.add(this._box, {
            row: 0,
            col: 0,
            x_expand: true,
            x_fill: true,
            y_expand: true,
            y_fill: true,
            x_align: St.Align.START,
            y_align: St.Align.START
        });
        this.actor.add(this._page_indicators.actor, {
            row: 1,
            col: 0,
            x_expand: true,
            x_fill: false,
            y_expand: true,
            y_fill: false,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.END
        });

        this._background_actor = new Meta.BackgroundActor();
        this._background_actor.add_child(this.actor);

        IDS.OVERVIEW_SHOWING = Main.overview.connect(
            "showing",
            Lang.bind(this, this._on_overview_showing)
        );
        IDS.OVERVIEW_HIDDEN = Main.overview.connect(
            "hidden",
            Lang.bind(this, this._on_overview_hiding)
        );
        IDS.MONITORS_CHANGED = global.screen.connect(
            'monitors-changed',
            Lang.bind(this, this._resize)
        );
        IDS.MAX_PAGES = Utils.SETTINGS.connect(
            'changed::' + PrefsKeys.DESKTOP_NOTES_MAX_PAGES,
            Lang.bind(this, function() {
                this._page_indicators.set_n_pages(
                    Utils.SETTINGS.get_int(PrefsKeys.DESKTOP_NOTES_MAX_PAGES)
                );
            })
        );

        this._enabled_notes = Utils.SETTINGS.get_strv(
            PrefsKeys.ENABLED_DESKTOP_NOTES_KEY
        );
        IDS.ENABLED_NOTES = Utils.SETTINGS.connect(
            'changed::' + PrefsKeys.ENABLED_DESKTOP_NOTES_KEY,
            Lang.bind(this, function() {
                this._enabled_notes = Utils.SETTINGS.get_strv(
                    PrefsKeys.ENABLED_DESKTOP_NOTES_KEY
                );
            })
        );
        this._is_modal = false;
        this._current_page_index = 0;
        this._notes = {};
        this._resize();
        this._load_notes();

        Shared.desktop_notes = this;
    },

    _on_key_release_event: function(o, e) {
        let symbol = e.get_key_symbol();

        if(symbol === Clutter.Escape) {
            this.hide_modal();
            return true;
        }

        return false;
    },

    _on_overview_showing: function() {
        this.hide();
    },

    _on_overview_hiding: function() {
        this.show();
    },

    _resize: function() {
        let primary = Main.layoutManager.primaryMonitor;
        let available_height = primary.height - Main.panel.actor.height;
        let my_width = primary.width;
        let my_height = available_height;

        this.actor.width = my_width;
        this.actor.height = my_height;
        this._box.width = my_width;
        this._box.height = my_height - 25; // this._page_indicators.actor.height;

        this.actor.y = Main.panel.actor.height;
    },

    _find_background_group: function() {
        let children = global.window_group.get_children();

        for(let i = 0; i < children.length; i++) {
            if(children[i] instanceof Meta.BackgroundGroup) {
                return children[i];
            }
        }

        return -1;
    },

    _destroy_all_notes: function() {
        for(let uri in this._notes) {
            this._notes[uri].destroy();
        }

        this._notes = {};
    },

    _destroy_container: function(uri) {
        this._notes[uri].destroy();
        delete this._notes[uri];
        this.indicate_pages();
    },

    _disconnect_all: function() {
        if(IDS.MONITORS_CHANGED !== 0) {
            global.screen.disconnect(IDS.MONITORS_CHANGED);
            IDS.MONITORS_CHANGED = 0;
        }
        if(IDS.OVERVIEW_SHOWING !== 0) {
            Main.overview.disconnect(IDS.OVERVIEW_SHOWING);
            IDS.OVERVIEW_SHOWING = 0;
        }
        if(IDS.OVERVIEW_HIDDEN !== 0) {
            Main.overview.disconnect(IDS.OVERVIEW_HIDDEN);
            IDS.OVERVIEW_HIDDEN = 0;
        }
        if(IDS.ENABLED_NOTES !== 0) {
            Utils.SETTINGS.disconnect(IDS.ENABLED_NOTES);
            IDS.ENABLED_NOTES = 0;
        }
        if(IDS.MAX_PAGES !== 0) {
            Utils.SETTINGS.disconnect(IDS.MAX_PAGES);
            IDS.MAX_PAGES = 0;
        }
        if(IDS.NOTE_DELETED !== 0) {
            Utils.get_client().disconnect(IDS.NOTE_DELETED);
            IDS.NOTE_DELETED = 0;
        }
        if(IDS.NOTE_SAVED !== 0) {
            Utils.get_client().disconnect(IDS.NOTE_SAVED);
            IDS.NOTE_SAVED = 0;
        }
    },

    _show_note: function(note, animation) {
        let properties = this.get_note_properties(note.uri);
        note.properties = properties;
        let note_container = new DesktopNoteContainer.DesktopNoteContainer(
            this,
            note
        );

        this._box.add_child(note_container.actor);
        this._notes[note.uri] = note_container;

        if(note_container.note.properties.page === this._current_page_index) {
            note_container.show(animation);
        }

        note_container.actor.x = note_container.note.properties.x;
        note_container.actor.y = note_container.note.properties.y;
        this.indicate_pages();
    },

    _load_note: function(uri) {
        if(!Utils.get_client().is_valid_uri(uri)) {
            return;
        }

        let note = new GnoteNote.GnoteNote(uri);
        note.connect(
            "notify::parsed",
            Lang.bind(this, function() {
                this._show_note(note);
            })
        );

        note.start_parsing();
    },

    _load_notes: function() {
        for(let i in this._enabled_notes) {
            let uri = this._enabled_notes[i];
            this._load_note(uri);
        }
    },

    _add_keybindings: function() {
        Main.wm.addKeybinding(
            PrefsKeys.SHOW_DESKTOP_NOTES_SHORTCUT_KEY,
            Utils.SETTINGS,
            Meta.KeyBindingFlags.NONE,
            Shell.KeyBindingMode.NORMAL |
            Shell.KeyBindingMode.MESSAGE_TRAY |
            Shell.KeyBindingMode.OVERVIEW,
            Lang.bind(this, this.toggle_modal)
        );
    },

    _remove_keybindings: function() {
        Main.wm.removeKeybinding(PrefsKeys.SHOW_DESKTOP_NOTES_SHORTCUT_KEY);
    },

    _cleanup_enabled_notes: function() {
        Utils.get_client().list_all_notes(
            Lang.bind(this, function(all_notes) {
                if(!all_notes) return;

                for(let i in this._enabled_notes) {
                    let uri = this._enabled_notes[i];

                    if(!Utils.get_client().is_valid_uri(uri)) {
                        continue;
                    }
                    else if(all_notes.indexOf(uri) === -1) {
                        this.remove_note(uri);
                    }
                }
            })
        )
    },

    indicate_pages: function() {
        let note_pages = [];

        for(let uri in this._notes) {
            let properties = this._notes[uri].note.properties;
            note_pages.push(properties.page);
        }

        for(let i = 0; i < this._page_indicators.n_pages; i++) {
            if(note_pages.indexOf(i) !== -1) {
                this._page_indicators.set_empty(i, false);
            }
            else {
                this._page_indicators.set_empty(i, true);
            }
        }
    },

    show_page: function(page_index) {
        let max_pages = Utils.SETTINGS.get_int(PrefsKeys.DESKTOP_NOTES_MAX_PAGES);

        if(page_index < 0 || page_index > (max_pages - 1)) return;
        if(page_index === this._current_page_index) return;

        this._current_page_index = page_index;
        this._page_indicators.set_current_page(this._current_page_index);

        for(let uri in this._notes) {
            if(this._notes[uri].note.properties.page === page_index) {
                this._notes[uri].show();
            }
            else {
                this._notes[uri].hide();
            }
        }
    },

    add_note: function(uri) {
        if(this.is_note_on_desktop(uri)) {
            log('Note "%s" already on desktop'.format(uri));
            return;
        }

        this._enabled_notes.push(uri)
        Utils.SETTINGS.set_strv(
            PrefsKeys.ENABLED_DESKTOP_NOTES_KEY,
            this._enabled_notes
        );
        this._load_note(uri);
    },

    update_note: function(uri) {
        let note = new GnoteNote.GnoteNote(uri);
        note.connect(
            "notify::parsed",
            Lang.bind(this, function() {
                this._destroy_container(uri);
                this._show_note(note, false);
            })
        );

        note.start_parsing();
    },

    remove_note: function(uri) {
        let index = this._enabled_notes.indexOf(uri);

        if(index !== -1) {
            this.delete_note_properties(uri);
            this._enabled_notes.splice(index, 1);
            Utils.SETTINGS.set_strv(
                PrefsKeys.ENABLED_DESKTOP_NOTES_KEY,
                this._enabled_notes
            );
        }

        let container = this._notes[uri];

        if(!container) return;

        if(!container.actor.visible) {
            this._destroy_container(uri);
        }
        else {
            container.hide(Lang.bind(this, function() {
                this._destroy_container(uri);
            }));
        }
    },

    is_note_on_desktop: function(uri) {
        let index = this._enabled_notes.indexOf(uri);

        if(index !== -1) return true;
        else return false;
    },

    get_note_properties: function(uri) {
        let json_data = Utils.SETTINGS.get_string(
            PrefsKeys.DESKTOP_NOTES_PROPERTIES_KEY
        );
        let storage = JSON.parse(json_data);
        let result = {
            x: DEFAULT_NOTE_PROPERTIES.X,
            y: DEFAULT_NOTE_PROPERTIES.Y,
            width: DEFAULT_NOTE_PROPERTIES.WIDTH,
            height: DEFAULT_NOTE_PROPERTIES.HEIGHT,
            color: DEFAULT_NOTE_PROPERTIES.COLOR,
            page: this._current_page_index
        };

        if(uri in storage) {
            result = storage[uri];
        }
        else {
            this.update_note_properties(uri, result);
        }

        return result;
    },

    update_note_properties: function(uri, new_properties) {
        let json_data = Utils.SETTINGS.get_string(
            PrefsKeys.DESKTOP_NOTES_PROPERTIES_KEY
        );
        let storage = JSON.parse(json_data);

        if(storage instanceof Array) {
            storage = {};
        }

        if(new_properties === null) new_properties = DEFAULT_NOTE_PROPERTIES;

        if(uri in storage) {
            let result_properties = storage[uri];
            
            for(let key in new_properties) {
                result_properties[key] = new_properties[key];
            }

            storage[uri] = result_properties;
        }
        else {
            storage[uri] = new_properties;
        }

        Utils.SETTINGS.set_string(
            PrefsKeys.DESKTOP_NOTES_PROPERTIES_KEY,
            JSON.stringify(storage)
        );

        if(this._notes[uri]) {
            this._notes[uri].note.properties = this.get_note_properties(uri);
        }
    },

    delete_note_properties: function(uri) {
        let json_data = Utils.SETTINGS.get_string(
            PrefsKeys.DESKTOP_NOTES_PROPERTIES_KEY
        );
        let storage = JSON.parse(json_data);

        if(uri in storage) {
            delete storage[uri];
            Utils.SETTINGS.set_string(
            PrefsKeys.DESKTOP_NOTES_PROPERTIES_KEY,
                JSON.stringify(storage)
            );
        }
    },

    set_background_color: function(r, g, b, a) {
        let color_string = 'rgba(%s, %s, %s, %s)'.format(r, g, b, a);
        let [res, color] = Clutter.Color.from_string(color_string);
        this.actor.set_background_color(color);
    },

    show: function() {
        if(this.actor.visible) return;

        this.actor.opacity = 0;
        this.actor.show();

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            opacity: 255,
            time: ANIMATION_TIMES.SHOW,
            transition: 'easeOutQuad'
        });
    },

    hide: function() {
        if(!this.actor.visible) return;

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            opacity: 0,
            time: ANIMATION_TIMES.HIDE,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this.actor.hide();
                this.actor.opacity = 255;
            })
        });
    },

    toggle_modal: function() {
        if(this._is_modal) {
            this.hide_modal();
        }
        else {
            this.show_modal();
        }
    },

    show_modal: function() {
        if(this._is_modal) return;

        this._background_actor.remove_child(this.actor);
        Main.uiGroup.add_child(this.actor);
        let push_result = Main.pushModal(this.actor, {
            keybindingMode: Shell.KeyBindingMode.NORMAL
        });

        if(!push_result) {
            Main.uiGroup.remove_child(this.actor);
            this._background_actor.add_child(this.actor);
            return;
        }

        this._is_modal = true;
        this.set_background_color(0, 0, 0, 0.5);
    },

    hide_modal: function() {
        if(!this._is_modal) return;

        Main.popModal(this.actor);
        Main.uiGroup.remove_child(this.actor);
        this._background_actor.add_child(this.actor);

        this._is_modal = false;
        this.set_background_color(0, 0, 0, 0);
    },

    enable: function() {
        let background_group = this._find_background_group();
        background_group.add_child(this._background_actor);
        this._add_keybindings();
        this._cleanup_enabled_notes();
    },

    disable: function() {
        this._disconnect_all();
        this._remove_keybindings();
        this.destroy();
    },

    destroy: function() {
        Shared.desktop_notes = null;
        this._destroy_all_notes();
        this._background_actor.destroy();
    }
});

let desktop_notes = null;

function get_desktop_notes() {
    if(desktop_notes === null) {
        desktop_notes = new DesktopNotes();
    }

    return desktop_notes;
}

function destroy_desktop_notes() {
    if(desktop_notes !== null) {
        desktop_notes.disable();
        desktop_notes = null;
    }
}
