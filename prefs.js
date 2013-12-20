const Lang = imports.lang;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const Params = imports.misc.params;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const PrefsKeys = Me.imports.prefs_keys;
const Utils = Me.imports.utils;
const Constants = Me.imports.constants;

const KeybindingsWidget = new GObject.Class({
    Name: 'Keybindings.Widget',
    GTypeName: 'KeybindingsWidget',
    Extends: Gtk.Box,

    _init: function(keybindings) {
        this.parent();
        this.set_orientation(Gtk.Orientation.VERTICAL);

        this._keybindings = keybindings;

        let scrolled_window = new Gtk.ScrolledWindow();
        scrolled_window.set_policy(
            Gtk.PolicyType.AUTOMATIC,
            Gtk.PolicyType.AUTOMATIC
        );

        this._columns = {
            NAME: 0,
            ACCEL_NAME: 1,
            MODS: 2,
            KEY: 3
        };

        this._store = new Gtk.ListStore();
        this._store.set_column_types([
            GObject.TYPE_STRING,
            GObject.TYPE_STRING,
            GObject.TYPE_INT,
            GObject.TYPE_INT
        ]);

        this._tree_view = new Gtk.TreeView({
            model: this._store,
            hexpand: true,
            vexpand: true
        });
        this._tree_view.get_selection().set_mode(Gtk.SelectionMode.SINGLE);

        let action_renderer = new Gtk.CellRendererText();
        let action_column = new Gtk.TreeViewColumn({
            'title': 'Action',
            'expand': true
        });
        action_column.pack_start(action_renderer, true);
        action_column.add_attribute(action_renderer, 'text', 1);
        this._tree_view.append_column(action_column);

        let keybinding_renderer = new Gtk.CellRendererAccel({
            'editable': true,
            'accel-mode': Gtk.CellRendererAccelMode.GTK
        });
        keybinding_renderer.connect('accel-edited',
            Lang.bind(this, function(renderer, iter, key, mods) {
                let value = Gtk.accelerator_name(key, mods);
                let [success, iterator ] =
                    this._store.get_iter_from_string(iter);

                if(!success) {
                    printerr("Can't change keybinding");
                }

                let name = this._store.get_value(iterator, 0);

                this._store.set(
                    iterator,
                    [this._columns.MODS, this._columns.KEY],
                    [mods, key]
                );
                Utils.SETTINGS.set_strv(name, [value]);
            })
        );

        let keybinding_column = new Gtk.TreeViewColumn({
            'title': 'Modify'
        });
        keybinding_column.pack_end(keybinding_renderer, false);
        keybinding_column.add_attribute(
            keybinding_renderer,
            'accel-mods',
            this._columns.MODS
        );
        keybinding_column.add_attribute(
            keybinding_renderer,
            'accel-key',
            this._columns.KEY
        );
        this._tree_view.append_column(keybinding_column);

        scrolled_window.add(this._tree_view);
        this.add(scrolled_window);

        this._refresh();
    },

    _refresh: function() {
        this._store.clear();

        for(let settings_key in this._keybindings) {
            let [key, mods] = Gtk.accelerator_parse(
                Utils.SETTINGS.get_strv(settings_key)[0]
            );

            let iter = this._store.append();
            this._store.set(iter,
                [
                    this._columns.NAME,
                    this._columns.ACCEL_NAME,
                    this._columns.MODS,
                    this._columns.KEY
                ],
                [
                    settings_key,
                    this._keybindings[settings_key],
                    mods,
                    key
                ]
            );
        }
    }
});

const DektopNoteColorsWidget = new GObject.Class({
    Name: 'DektopNoteColors.Widget',
    GTypeName: 'DektopNoteColors',
    Extends: Gtk.Box,

    _init: function(colors) {
        this.parent();
        this.set_orientation(Gtk.Orientation.VERTICAL);

        this._colors = Utils.SETTINGS.get_strv(PrefsKeys.DESKTOP_NOTES_COLORS_KEY);

        let label = new Gtk.Label({
            label: "Colors:",
            halign: Gtk.Align.START,
            margin_bottom: 10
        });
        this.add(label);

        let scrolled_window = new Gtk.ScrolledWindow({
            hexpand: true,
            vexpand: true
        });
        scrolled_window.set_policy(
            Gtk.PolicyType.AUTOMATIC,
            Gtk.PolicyType.AUTOMATIC
        );
        this.add(scrolled_window);

        this._box = new Gtk.Box();
        scrolled_window.add(this._box);

        this._grid_max_columns = 6;
        this._grid = new Gtk.Grid({
            column_spacing: 10,
            row_spacing: 10
        });
        this._box.add(this._grid);

        this._init_buttons();
        this._refresh();
    },

    _init_buttons: function() {
        let toolbar = new Gtk.Toolbar();
        toolbar.get_style_context().add_class(Gtk.STYLE_CLASS_INLINE_TOOLBAR);

        let add_button = new Gtk.ToolButton({
            stock_id: Gtk.STOCK_ADD,
            label: "Add color",
            is_important: true
        });
        toolbar.add(add_button);
        add_button.connect("clicked", Lang.bind(this, function() {
            let color_chooser = new Gtk.ColorChooserDialog({
                modal: true,
                use_alpha: true
            });

            if(color_chooser.run() === Gtk.ResponseType.OK) {
                let new_color = color_chooser.get_rgba(new Gdk.RGBA());

                this._add_color(new_color);
                this._refresh();
            }

            color_chooser.destroy();
        }));

        this.add(toolbar);
    },

    _add_color: function(gdk_rgba) {
        let rgba_string = gdk_rgba.to_string();

        this._colors.push(rgba_string);
        Utils.SETTINGS.set_strv(
            PrefsKeys.DESKTOP_NOTES_COLORS_KEY,
            this._colors
        )
    },

    _remove_color: function(gdk_rgba_to_remove) {
        let index = -1;
        let gdk_rgba = new Gdk.RGBA();

        for(let i in this._colors) {
            gdk_rgba.parse(this._colors[i]);

            if(gdk_rgba.hash() === gdk_rgba_to_remove.hash()) {
                index = i;
                break;
            }
        }

        if(index !== -1) {
            this._colors.splice(index, 1);
            Utils.SETTINGS.set_strv(
                PrefsKeys.DESKTOP_NOTES_COLORS_KEY,
                this._colors
            );
        }

        this._refresh();
    },

    _refresh: function() {
        let row = 0;
        let column = 0;
        let children = this._grid.get_children();

        for(let i in children) {
            children[i].destroy();
        }

        for(let i in this._colors) {
            let color = this._colors[i];
            let rgba = new Gdk.RGBA();
            rgba.parse(color);

            let button = new Gtk.Button({
                width_request: 70,
                height_request: 40
            });

            button.override_background_color(Gtk.StateFlags.NORMAL, rgba);
            button.connect('clicked', Lang.bind(this, function() {
                this._remove_color(rgba);
            }));
            this._grid.attach(button, column, row, 1, 1);

            if(column >= this._grid_max_columns) {
                column = 0;
                row++;
            }
            else {
                column++;
            }
        }

        this.show_all();
    }
});

const PrefsGrid = new GObject.Class({
    Name: 'Prefs.Grid',
    GTypeName: 'PrefsGrid',
    Extends: Gtk.Grid,

    _init: function(settings, params) {
        this.parent(params);
        this._settings = settings;
        this.margin = this.row_spacing = this.column_spacing = 10;
        this._rownum = 0;
    },

    add_entry: function(text, key) {
        let item = new Gtk.Entry({
            hexpand: false
        });
        item.text = this._settings.get_string(key);
        this._settings.bind(key, item, 'text', Gio.SettingsBindFlags.DEFAULT);

        return this.add_row(text, item);
    },

    add_shortcut: function(text, settings_key) {
        let item = new Gtk.Entry({
            hexpand: false
        });
        item.set_text(this._settings.get_strv(settings_key)[0]);
        item.connect('changed', Lang.bind(this, function(entry) {
            let [key, mods] = Gtk.accelerator_parse(entry.get_text());

            if(Gtk.accelerator_valid(key, mods)) {
                let shortcut = Gtk.accelerator_name(key, mods);
                this._settings.set_strv(settings_key, [shortcut]);
            }
        }));

        return this.add_row(text, item);
    },

    add_boolean: function(text, key) {
        let item = new Gtk.Switch({
            active: this._settings.get_boolean(key)
        });
        this._settings.bind(key, item, 'active', Gio.SettingsBindFlags.DEFAULT);

        return this.add_row(text, item);
    },

    add_combo: function(text, key, list, type) {
        let item = new Gtk.ComboBoxText();

        for(let i = 0; i < list.length; i++) {
            let title = list[i].title.trim();
            let id = list[i].value.toString();
            item.insert(-1, id, title);
        }

        if(type === 'string') {
            item.set_active_id(this._settings.get_string(key));
        }
        else {
            item.set_active_id(this._settings.get_int(key).toString());
        }

        item.connect('changed', Lang.bind(this, function(combo) {
            let value = combo.get_active_id();

            if(type === 'string') {
                if(this._settings.get_string(key) !== value) {
                    this._settings.set_string(key, value);
                }
            }
            else {
                value = parseInt(value, 10);

                if(this._settings.get_int(key) !== value) {
                    this._settings.set_int(key, value);
                }
            }
        }));

        return this.add_row(text, item);
    },

    add_spin: function(label, key, adjustment_properties, spin_properties) {
        adjustment_properties = Params.parse(adjustment_properties, {
            lower: 0,
            upper: 100,
            step_increment: 100
        });
        let adjustment = new Gtk.Adjustment(adjustment_properties);

        spin_properties = Params.parse(spin_properties, {
            adjustment: adjustment,
            numeric: true,
            snap_to_ticks: true
        }, true);
        let spin_button = new Gtk.SpinButton(spin_properties);

        spin_button.set_value(this._settings.get_int(key));
        spin_button.connect('value-changed', Lang.bind(this, function(spin) {
            let value = spin.get_value_as_int();

            if(this._settings.get_int(key) !== value) {
                this._settings.set_int(key, value);
            }
        }));

        return this.add_row(label, spin_button, true);
    },

    add_row: function(text, widget, wrap) {
        let label = new Gtk.Label({
            label: text,
            hexpand: true,
            halign: Gtk.Align.START
        });
        label.set_line_wrap(wrap || false);

        this.attach(label, 0, this._rownum, 1, 1); // col, row, colspan, rowspan
        this.attach(widget, 1, this._rownum, 1, 1);
        this._rownum++;

        return widget;
    },

    add_item: function(widget, col, colspan, rowspan) {
        this.attach(
            widget,
            col || 0,
            this._rownum,
            colspan || 2,
            rowspan || 1
        );
        this._rownum++;

        return widget;
    },

    add_range: function(label, key, range_properties) {
        range_properties = Params.parse(range_properties, {
            min: 0,
            max: 100,
            step: 10,
            mark_position: 0,
            add_mark: false,
            size: 200,
            draw_value: true
        });

        let range = Gtk.Scale.new_with_range(
            Gtk.Orientation.HORIZONTAL,
            range_properties.min,
            range_properties.max,
            range_properties.step
        );
        range.set_value(this._settings.get_int(key));
        range.set_draw_value(range_properties.draw_value);

        if(range_properties.add_mark) {
            range.add_mark(
                range_properties.mark_position,
                Gtk.PositionType.BOTTOM,
                null
            );
        }

        range.set_size_request(range_properties.size, -1);

        range.connect('value-changed', Lang.bind(this, function(slider) {
            this._settings.set_int(key, slider.get_value());
        }));

        return this.add_row(label, range, true);
    }
});

const PrefsWidget = new GObject.Class({
    Name: 'Prefs.Widget',
    GTypeName: 'PrefsWidget',
    Extends: Gtk.Box,

    _init: function(params) {
        this.parent(params);
        this._settings = Utils.getSettings();

        let notebook = new Gtk.Notebook({
            margin_left: 5,
            margin_top: 5,
            margin_bottom: 5,
            margin_right: 5,
            expand: true
        });

        let main_page = this._get_main_page();
        let font_size_page = this._get_font_size_page();
        let window_size_page = this._get_window_size_page();
        let desktop_notes_page = this._get_desktop_notes_page();
        let keybindings_page = this._get_keybindings_page();

        notebook.append_page(main_page.page, main_page.label);
        notebook.append_page(font_size_page.page, font_size_page.label);
        notebook.append_page(window_size_page.page, window_size_page.label);
        notebook.append_page(desktop_notes_page.page, desktop_notes_page.label);
        notebook.append_page(keybindings_page.page, keybindings_page.label);

        this.add(notebook);
    },

    _get_main_page: function() {
        let page_label = new Gtk.Label({
            label: 'Main'
        });
        let page = new PrefsGrid(this._settings);

        let apps = [
            {
                title: 'Gnote',
                value: Constants.APPLICATION.GNOTE
            },
            {
                title: 'Tomboy',
                value: Constants.APPLICATION.TOMBOY
            }
        ];
        page.add_combo(
            'App:',
            PrefsKeys.DBUS_NAME_KEY,
            apps,
            'string'
        );

        page.add_boolean(
            'Enable animations:',
            PrefsKeys.ENABLE_ANIMATIONS_KEY
        );
        page.add_spin(
            'Max displayed notes:',
            PrefsKeys.MAX_DISPLAYED_NOTES_KEY,
            {
                lower: 5,
                upper: 200,
                step_increment: 5
            }
        );
        page.add_spin(
            'Max snippet length:',
            PrefsKeys.MAX_SNIPPET_LENGTH_KEY,
            {
                lower: 50,
                upper: 500,
                step_increment: 10
            }
        );

        let result = {
            label: page_label,
            page: page
        };
        return result;
    },

    _get_font_size_page: function() {
        let page_label = new Gtk.Label({
            label: 'Font size'
        });
        let page = new PrefsGrid(this._settings);

        let spin_properties = {
            lower: 5,
            upper: 50,
            step_increment: 1
        };

        page.add_spin(
            'Title: ',
            PrefsKeys.TITLE_SIZE_KEY,
            spin_properties
        );
        page.add_spin(
            'Snippet: ',
            PrefsKeys.SNIPPET_SIZE_KEY,
            spin_properties
        );
        page.add_spin(
            'Date: ',
            PrefsKeys.DATE_SIZE_KEY,
            spin_properties
        );
        page.add_spin(
            'Note title: ',
            PrefsKeys.NOTE_TITLE_SIZE_KEY,
            spin_properties
        );
        page.add_spin(
            'Note contents: ',
            PrefsKeys.NOTE_CONTENTS_SIZE_KEY,
            spin_properties
        );

        let result = {
            label: page_label,
            page: page
        };
        return result;
    },

    _get_window_size_page: function() {
        let page_label = new Gtk.Label({
            label: 'Window size'
        });
        let page = new PrefsGrid(this._settings);

        let range_properties = {
            min: 10,
            max: 100,
            step: 10,
            size: 300
        };
        page.add_range(
            'Width (% of screen):',
            PrefsKeys.WIDTH_PERCENTS_KEY,
            range_properties
        )
        page.add_range(
            'Height (% of screen):',
            PrefsKeys.HEIGHT_PERCENTS_KEY,
            range_properties
        )

        let result = {
            label: page_label,
            page: page
        };
        return result;
    },

    _get_desktop_notes_page: function() {
        let page_label = new Gtk.Label({
            label: 'Desktop notes'
        });
        let page = new PrefsGrid(this._settings);

        page.add_boolean(
            'Desktop notes:',
            PrefsKeys.ENABLE_DESKTOP_NOTES_KEY
        );

        let spin_properties = {
            lower: 5,
            upper: 50,
            step_increment: 1
        };

        page.add_spin(
            'Title size:',
            PrefsKeys.DESKTOP_NOTE_TITLE_SIZE_KEY,
            spin_properties
        );
        page.add_spin(
            'Content size:',
            PrefsKeys.DESKTOP_NOTE_CONTENT_SIZE_KEY,
            spin_properties
        );

        page.add_spin(
            'Max pages:',
            PrefsKeys.DESKTOP_NOTES_MAX_PAGES,
            {
                lower: 2,
                upper: 20,
                step_increment: 1
            }
        )

        let colors_widget = new DektopNoteColorsWidget();
        page.add_item(colors_widget);

        let result = {
            label: page_label,
            page: page
        };
        return result;
    },

    _get_keybindings_page: function() {
        let page_label = new Gtk.Label({
            label: 'Shortcuts'
        });
        let page = new PrefsGrid(this._settings);

        let enable_shortcuts = page.add_boolean(
            'Shortcuts:',
            PrefsKeys.ENABLE_SHORTCUTS_KEY
        );
        enable_shortcuts.connect('notify::active',
            Lang.bind(this, function(s) {
                let active = s.get_active();
                keybindings_widget.set_sensitive(active);
            })
        );

        let shortcuts_enabled = this._settings.get_boolean(
            PrefsKeys.ENABLE_SHORTCUTS_KEY
        );

        let keybindings = {};
        keybindings[PrefsKeys.SHOW_DIALOG_SHORTCUT_KEY] = 'Show dialog';
        keybindings[PrefsKeys.SHOW_MENU_SHORTCUT_KEY] = 'Show menu';
        keybindings[PrefsKeys.SHOW_DESKTOP_NOTES_SHORTCUT_KEY] = 'Show desktop notes';

        let keybindings_widget = new KeybindingsWidget(keybindings);
        keybindings_widget.set_sensitive(shortcuts_enabled);
        page.add_item(keybindings_widget)

        let result = {
            label: page_label,
            page: page
        };
        return result;
    },
});

function init() {
    // nothing
}

function buildPrefsWidget() {
    let widget = new PrefsWidget();
    widget.show_all();

    return widget;
}
