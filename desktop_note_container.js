const St = imports.gi.St;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Signals = imports.signals;
const Pango = imports.gi.Pango;
const Tweener = imports.ui.tweener;
const Params = imports.misc.params;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const DesktopNoteToolbar = Me.imports.desktop_note_toolbar;
const NoteDateLabel = Me.imports.note_date_label;
const DesktopNoteView = Me.imports.desktop_note_view;
const Shared = Me.imports.shared;

const MIN_WIDTH = 150;
const MIN_HEIGHT = 150;

const ANIMATION_TIMES = {
    RESIZE: 0.3,
    HIDE: 0.5,
    SHOW: 0.5,
    NEW_PAGE: 0.3
};

const DesktopNoteButtonBase = new Lang.Class({
    Name: 'DesktopNoteButtonBase',

    _init: function(params) {
        this.params = Params.parse(params, {
            container: null,
            icon_name: null,
            gicon: null,
            style_class: '',
            min_opacity: 100,
            max_opacity: 255
        });

        if(!this.params.container instanceof DesktopNoteContainer) {
            throw new Error('container is note DesktopNoteContainer instance');
        }

        this.actor = new St.Icon({
            style_class: this.params.style_class,
            reactive: true,
            opacity: this.params.min_opacity,
            x: 0,
            y: 0
        });

        if(this.params.icon_name !== null) {
            this.actor.set_icon_name(this.params.icon_name);
        }
        else if(this.params.gicon !== null) {
            this.actor.set_gicon(this.params.gicon);
        }
        else {
            throw new Error('icon_name and gicon are both null');
        }

        this.actor.connect('enter-event', Lang.bind(this, function() {
            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, {
                time: 0.3,
                transition: 'easeOutQuad',
                opacity: this.params.max_opacity
            });
        }));
        this.actor.connect('leave-event', Lang.bind(this, function() {
            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, {
                time: 0.3,
                transition: 'easeOutQuad',
                opacity: this.params.min_opacity
            });
        }));

        this.params.container.connect('showed',
            Lang.bind(this, this.on_container_showed)
        );
        this.params.container.connect('resized',
            Lang.bind(this, this.on_container_showed)
        );
        this.params.container.actor.add_child(this.actor);
    },

    reposition: function() {
        throw new Error('not implemented');
    },

    on_container_showed: function() {
        this.actor.opacity = this.params.min_opacity;
        this.reposition();
        this.actor.show();
    },

    destroy: function() {
        delete this.params.container;
        this.actor.destroy();
    }
});

const DesktopNoteCloseButton = new Lang.Class({
    Name: 'DesktopNoteCloseButton',
    Extends: DesktopNoteButtonBase,

    _init: function(desktop_note_container) {
        this.parent({
            container: desktop_note_container,
            style_class: 'desktop-note-close-icon',
            icon_name: Utils.ICONS.DESKTOP_NOTE_CLOSE
        });

        this.actor.connect('button-release-event', Lang.bind(this, function(o, e) {
            let button = e.get_button();
            if(button !== Clutter.BUTTON_PRIMARY) return false;

            Shared.desktop_notes.remove_note(this.params.container.uri);
            return true;
        }));
    },

    reposition: function() {
        let margin = 2;
        this.actor.x =
            this.params.container._table.x
            + this.params.container._table.width
            - this.actor.width
            - margin;
        this.actor.y =
            this.params.container._table.y
            + margin;
    }
});

const DesktopNoteResizeButton = new Lang.Class({
    Name: 'DesktopNoteResizeButton',
    Extends: DesktopNoteButtonBase,

    _init: function(desktop_note_container) {
        let gicon = new Gio.FileIcon({
            file: Gio.File.new_for_path(Me.path + '/images/resize.svg')
        });

        this.parent({
            container: desktop_note_container,
            style_class: 'desktop-note-resize-icon',
            gicon: gicon
        });

        this._start_size = {
            width: 0,
            height: 0
        };
        this._last_size = {
            width: 0,
            height: 0
        };
        this._container_max_size = {
            width: 0,
            height: 0
        };
        this._resize_background = null;
    },

    _add_drag_action: function() {
        let drag_action = new Clutter.DragAction();
        drag_action.connect(
            'drag-begin',
            Lang.bind(this, function() {
                let [x, y] = this.params.container.actor.get_transformed_position();
                this._resize_background = new St.Bin({
                    style_class: 'desktop-note-container',
                    width: this.params.container.actor.width,
                    height: this.params.container.actor.height,
                    x: x,
                    y: y
                });
                Main.uiGroup.add_child(this._resize_background);

                this._start_size.width = this.params.container.actor.width;
                this._start_size.height = this.params.container.actor.height;
                this._last_size.width = this.params.container.actor.width;
                this._last_size.height = this.params.container.actor.height;
                this._container_max_size = this.params.container.get_max_size();

                this.actor.hide();
                this.params.container._close_button.actor.hide();
            })
        );
        drag_action.connect(
            'drag-progress',
            Lang.bind(this, function(action, actor, delta_x, delta_y) {
                let [x, y] = action.get_motion_coords();
                let width = this._start_size.width + delta_x;
                let height = this._start_size.height + delta_y;

                if(
                    width >= MIN_WIDTH
                    && width <= this._container_max_size.width
                ) {
                    this._resize_background.width = width;
                    this._last_size.width = width;
                }
                if(
                    height >= MIN_HEIGHT
                    && height <= this._container_max_size.height
                ) {
                    this._resize_background.height = height;
                    this._last_size.height = height;
                }

                return false;
            })
        );
        drag_action.connect(
            'drag-end',
            Lang.bind(this, function() {
                this.params.container.update_properties({
                    width: this._last_size.width,
                    height: this._last_size.height
                });
                this.params.container.resize(
                    this._last_size.width,
                    this._last_size.height
                );

                this._resize_background.destroy();
                this._resize_background = null;
                this.params.container.reset_drag_area();
                this._container_max_size = {
                    width: 0,
                    height: 0
                };
            })
        );
        this.actor.add_action(drag_action);
    },

    reposition: function() {
        let margin = 1;
        this.actor.x =
            this.params.container._table.width
            - this.actor.width
            - margin;
        this.actor.y =
            this.params.container._table.height
            - this.actor.height
            - margin;
    },

    on_container_showed: function() {
        this.parent();
        if(!this.actor.has_actions()) this._add_drag_action();
    },

    destroy: function() {
        if(this._resize_background) {
            this._resize_background.destroy();
        }

        this.parent();
    }
});

const DesktopNoteContainer = new Lang.Class({
    Name: "DesktopNoteContainer",

    _init: function(desktop_notes, note) {
        this._note = note;
        this.desktop_notes = desktop_notes;

        this.actor = new Clutter.Actor();
        this.actor.set_pivot_point(0.5, 0.5);
        this.actor.hide();

        this._table = new St.Table({
            homogeneous: false,
            style_class: 'desktop-note-container',
            width: this._note.properties.width,
            height: this._note.properties.height
        });
        this.actor.add_child(this._table);

        this._close_button = new DesktopNoteCloseButton(this);
        this._resize_button = new DesktopNoteResizeButton(this);

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

        this._table.add(this._note_title, {
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
        let [color_result, note_color] =
            Clutter.Color.from_string(this._note.properties.color)
        let scroll_child = new St.BoxLayout({
            vertical: true
        });

        this._note_content_view = new DesktopNoteView.DesktopNoteView(this);
        this._note_content_view.connect('url-clicked',
            Lang.bind(this, function(o, uri) {
                this.desktop_notes.hide_modal();
                Utils.open_uri(uri);
            })
        );
        this._note_content_view.connect('note-clicked',
            Lang.bind(this, function(o, title) {
                Utils.get_client().find_note(title,
                    Lang.bind(this, function(note_uri) {
                        if(!note_uri) return;

                        this.desktop_notes.hide_modal();
                        Utils.get_client().display_note(note_uri);
                    })
                );
            })
        );
        this._table.add(this._note_content_view.actor, {
            row: 1,
            col: 0,
            col_span: 2
        });
        this.set_note_background(note_color);
    },

    _init_note_date: function() {
        this._note_date_label = new NoteDateLabel.NoteDateLabel({
            style_class: 'desktop-note-date',
            create_date: this._note.create_date,
            update_date: this._note.update_date
        });
        this._table.add(this._note_date_label.actor, {
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
        this._table.add(this._toolbar.actor, {
            row: 2,
            col: 1,
            x_expand: false,
            y_expand: false,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.END
        });
    },

    _set_note_drag_area: function() {
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
            this._set_note_drag_area();
        }

        this._note_drag_action_handle_clone = new Clutter.Clone({
            source: this.actor,
            opacity: 100,
            x: this.actor.x,
            y: this.actor.y
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

    reset_drag_area: function() {
        this._note_drag_action.set_drag_area(null);
    },

    set_note_background: function(clutter_color) {
        this._note_content_view.set_background(clutter_color);
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

    resize: function(width, height) {
        Tweener.removeTweens(this.table);
        Tweener.addTween(this.table, {
            time: ANIMATION_TIMES.RESIZE,
            transition: 'easeOutQuad',
            width: width,
            height: height,
            onComplete: Lang.bind(this, function() {
                this.emit('resized');
            })
        });
    },

    get_max_size: function() {
        let parent = this.actor.get_parent();
        let width = parent.width - this.actor.x;
        let height = parent.height - this.actor.y;

        return {
            width: width,
            height: height
        };
    },

    show: function(animation) {
        if(animation === false) {
            this.actor.opacity = 255;
            this.actor.scale_x = 1;
            this.actor.scale_y = 1;
            this.actor.show();
            this.emit('showed');
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
                opacity: 255,
                onComplete: Lang.bind(this, function() {
                    this.emit('showed');
                })
            });
        }
    },

    hide: function(on_complete) {
        if(!this.actor.visible) return;

        this._note_content_view.set_selection(0, 0);

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            time: ANIMATION_TIMES.HIDE / St.get_slow_down_factor(),
            transition: 'easeOutQuad',
            scale_x: 0.2,
            scale_y: 0.2,
            opacity: 0,
            onComplete: Lang.bind(this, function() {
                this.actor.hide();
                this.emit('hided');
                if(typeof on_complete === 'function') on_complete()
            })
        });
    },

    destroy: function() {
        if(this._note_drag_action_handle_clone) {
            this._note_drag_action_handle_clone.destroy();
        }

        this._note_content_view.destroy();
        this._resize_button.destroy();
        this._note.destroy();
        this._toolbar.destroy();
        this.actor.destroy();
    },

    get note() {
        return this._note;
    },

    get uri() {
        return this._note.uri;
    },

    get table() {
        return this._table;
    },

    set is_modal(modal) {
        this._is_modal = modal;
    },

    get is_modal() {
        return this._is_modal;
    }
});
Signals.addSignalMethods(DesktopNoteContainer.prototype);
