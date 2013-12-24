const St = imports.gi.St;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Clutter = imports.gi.Clutter;
const Pango = imports.gi.Pango;
const Tweener = imports.ui.tweener;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const DesktopNoteToolbar = Me.imports.desktop_note_toolbar;
const NoteDateLabel = Me.imports.note_date_label;

const MIN_WIDTH = 200;
const MIN_HEIGHT = 200;

const ANIMATION_TIMES = {
    RESIZE: 0.3,
    HIDE: 0.5,
    SHOW: 0.5,
    NEW_PAGE: 0.3
};

const DesktopNoteContainer = new Lang.Class({
    Name: "DesktopNoteContainer",

    _init: function(desktop_notes, note) {
        this._note = note;
        this.desktop_notes = desktop_notes;

        this.actor = new St.Table({
            homogeneous: false,
            style_class: 'desktop-note-container',
            width: this._note.properties.width,
            height: this._note.properties.height
        });
        this.actor.set_pivot_point(0.5, 0.5);
        this.actor.hide();

        this._resize_background = null;

        this._init_note_title();
        this._init_note_content();
        this._init_note_date();
        this._init_note_toolbar();

        this._is_modal = false;
        this._note_drag_action = null;
        this._note_drag_action_handle_clone = null;
        this._add_note_drag_action();
    },

    _init_note_title: function(width) {
        this._note_title = new St.Label({
            style_class: 'desktop-note-title',
            reactive: true
        });
        this._note_title.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        this._note_title.clutter_text.set_markup(
            '<span font="%s">%s</span>'.format(
                Utils.SETTINGS.get_int(
                    PrefsKeys.DESKTOP_NOTE_TITLE_SIZE_KEY
                ),
                this._note.title
            )
        );

        this.actor.add(this._note_title, {
            row: 0,
            col: 0,
            col_span: 2,
            x_expand: false,
            y_expand: false,
            x_fill: true,
            y_fill: false,
            x_align: St.Align.START
        });
    },

    _init_note_content: function(width, height) {
        this._note_markup = new St.Entry();
        this._note_markup.connect('captured-event',
            Lang.bind(this, function(o, e) {
                if(e.type() === Clutter.EventType.BUTTON_PRESS) {
                    if(this._is_modal) return false;

                    this._note_markup.clutter_text.set_editable(true);
                    let result = Main.pushModal(this.actor, {
                        keybindingMode: Shell.KeyBindingMode.NORMAL
                    });

                    if(result) this._is_modal = true;

                    return false;
                }
                else if(e.type() === Clutter.EventType.LEAVE) {
                    this._note_markup.clutter_text.set_selection(0, 0);

                    if(this._is_modal) {
                        Main.popModal(this.actor);
                        this._is_modal = false;
                    }

                    return false;
                }
                else if(e.type() === Clutter.EventType.KEY_PRESS) {
                    if(e.has_control_modifier()) return false;

                    let symbol = e.get_key_symbol();
                    let ch = Utils.get_unichar(symbol);
                    let backspace = symbol === Clutter.BackSpace;
                    let enter =
                        symbol == Clutter.Return || symbol == Clutter.KP_Enter;

                    if(ch || backspace || enter) return true;
                    else return false;
                }
                else {
                    return false;
                }
            })
        );
        this._note_markup.clutter_text.set_single_line_mode(false);
        this._note_markup.clutter_text.set_activatable(false);
        this._note_markup.clutter_text.set_line_wrap(true);
        this._note_markup.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD);
        this._note_markup.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
        this._note_markup.clutter_text.set_editable(false);
        this._note_markup.clutter_text.set_markup(this._note.markup);

        let [color_result, note_color] =
            Clutter.Color.from_string(this._note.properties.color)
        let scroll_child = new St.BoxLayout({
            vertical: true
        });
        scroll_child.add(this._note_markup);
        this._note_scroll = new St.ScrollView({
            style_class: 'desktop-note-content'
        });
        this._note_scroll.set_background_color(note_color);
        this._note_scroll.add_actor(scroll_child);

        this._note_box = new St.BoxLayout({
            style_class: 'desktop-note-scrollbox'
        });
        this._note_box.add_child(this._note_scroll);

        this.actor.add(this._note_box, {
            row: 1,
            col: 0,
            col_span: 2,
            x_expand: true,
            y_expand: true,
            x_fill: true,
            y_fill: true
        });
    },

    _init_note_date: function() {
        this._note_date_label = new NoteDateLabel.NoteDateLabel({
            style_class: 'desktop-note-date',
            create_date: this._note.create_date,
            update_date: this._note.update_date
        });
        this.actor.add(this._note_date_label.actor, {
            row: 2,
            col: 0,
            x_expand: false,
            y_expand: false,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.START
        });
    },

    _init_note_toolbar: function() {
        this._toolbar = new DesktopNoteToolbar.DesktopNoteToolbar(this);
        this.actor.add(this._toolbar.actor, {
            row: 2,
            col: 1,
            x_expand: false,
            y_expand: false,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.END
        });

        let resize_drag_action = new Clutter.DragAction();
        resize_drag_action.connect(
            'drag-begin',
            Lang.bind(this, function() {
                let [x, y] = this.actor.get_transformed_position();
                this._resize_background = new St.Bin({
                    style_class: 'desktop-note-container',
                    width: this.actor.width,
                    height: this.actor.height,
                    x: x,
                    y: y
                });
                Main.uiGroup.add_child(this._resize_background);

                this._toolbar.resize_button.start_size = {
                    width: this.actor.width,
                    height: this.actor.height
                };
                this._toolbar.resize_button.last_size = {
                    width: this.actor.width,
                    height: this.actor.height
                };
            })
        );
        resize_drag_action.connect(
            'drag-progress',
            Lang.bind(this, function(action, actor, delta_x, delta_y) {
                let [x, y] = resize_drag_action.get_motion_coords();
                let width = this._toolbar.resize_button.start_size.width + delta_x;
                let height = this._toolbar.resize_button.start_size.height + delta_y;

                if(width >= MIN_WIDTH) {
                    this._resize_background.width = width;
                    this._toolbar.resize_button.last_size.width = width;
                }
                if(height >= MIN_HEIGHT) {
                    this._resize_background.height = height;
                    this._toolbar.resize_button.last_size.height = height;
                }

                return false;
            })
        );
        resize_drag_action.connect(
            'drag-end',
            Lang.bind(this, function() {
                let width = this._toolbar.resize_button.last_size.width;
                let height = this._toolbar.resize_button.last_size.height;

                this.update_properties({
                    width: width,
                    height: height
                });

                this.resize_actor(width, height);

                this._resize_background.destroy();
                this._resize_background = null;

                this._note_drag_action.set_drag_area(null);
            })
        );
        this._toolbar.resize_button.add_action(resize_drag_action);
    },

    _set_not_drag_area: function() {
        let parent = this.actor.get_parent();
        let area_width = parent.width - this.actor.width;
        let area_height = parent.height - this.actor.height;
        let drag_area = new Clutter.Rect({
            origin: new Clutter.Point({
                x: 0,
                y: 0
            }),
            size: new Clutter.Size({
                width: area_width,
                height: area_height
            })
        });
        this._note_drag_action.set_drag_area(drag_area);
    },

    _add_note_drag_action: function() {
        this._note_drag_action = new Clutter.DragAction();
        this._note_drag_action.connect(
            'drag-begin',
            Lang.bind(this, this._on_drag_begin)
        );
        this._note_drag_action.connect(
            'drag-end',
            Lang.bind(this, this._on_drag_end)
        );

        this._note_title.add_action(this._note_drag_action);
        this._note_drag_action.set_drag_handle(this.actor);
    },

    _on_drag_begin: function(action, actor, x, y, mods) {
        if(!this._note_drag_action.drag_area_set) {
            this._set_not_drag_area();
        }

        this._note_drag_action_handle_clone = new Clutter.Clone({
            source: this.actor,
            x: this.actor.x,
            y: this.actor.y,
            opacity: 100
        });
        this.actor.get_parent().add_child(this._note_drag_action_handle_clone);
    },

    _on_drag_end: function(action, actor, x, y, mods) {
        let position = this.actor.get_position();
        this.update_properties({
            x: Math.round(position[0]),
            y: Math.round(position[1])
        });
        this._note_drag_action_handle_clone.destroy();
    },

    set_note_background: function(clutter_color) {
        this._note_scroll.set_background_color(clutter_color);
    },

    resize_actor: function(width, height) {
        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            time: ANIMATION_TIMES.RESIZE,
            transition: 'easeOutQuad',
            width: width,
            height: height
        });
    },

    update_properties: function(new_properties) {
        this.desktop_notes.update_note_properties(this.uri, new_properties);
    },

    animate_to_new_page: function(new_page, old_page) {
        let primary_width = Main.layoutManager.primaryMonitor.width;
        let new_x;

        if(new_page > old_page) {
            new_x = primary_width + this.actor.width + 50;
        }
        else {
            new_x = 0 - this.actor.width * 2;
        }

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            time: ANIMATION_TIMES.NEW_PAGE / St.get_slow_down_factor(),
            transition: 'easeInBack',
            translation_x: new_x,
            onComplete: Lang.bind(this, function() {
                this.actor.hide();
                this.actor.translation_x = 0;
            })
        });
    },

    show: function(animation) {
        if(animation === false) {
            this.actor.opacity = 255;
            this.actor.scale_x = 1;
            this.actor.scale_y = 1;
            this.actor.show();
        }
        else {
            this.actor.opacity = 0;
            this.actor.scale_x = 0.2;
            this.actor.scale_y = 0.2;
            this.actor.show();

            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, {
                time: ANIMATION_TIMES.SHOW / St.get_slow_down_factor(),
                transition: 'easeOutQuad',
                scale_x: 1,
                scale_y: 1,
                opacity: 255
            });
        }
    },

    hide: function(on_complete) {
        if(!this.actor.visible) return;

        this._note_markup.clutter_text.set_selection(0, 0);

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            time: ANIMATION_TIMES.HIDE / St.get_slow_down_factor(),
            transition: 'easeOutQuad',
            scale_x: 0.2,
            scale_y: 0.2,
            opacity: 0,
            onComplete: Lang.bind(this, function() {
                this.actor.hide();
                if(typeof on_complete === 'function') on_complete()
            })
        });
    },

    destroy: function() {
        if(this._note_drag_action_handle_clone) {
            this._note_drag_action_handle_clone.destroy();
        }
        if(this._resize_background) {
            this._resize_background.destroy();
        }

        this._note.destroy();
        this._toolbar.destroy();
        this.actor.destroy();
    },

    get note() {
        return this._note;
    },

    get uri() {
        return this._note.uri;
    }
});
