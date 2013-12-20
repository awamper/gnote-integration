const St = imports.gi.St;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const ListViewItemBase = Me.imports.list_view_item_base;
const GnoteNote = Me.imports.gnote_note;
const GnoteListItemButtons = Me.imports.gnote_list_item_buttons;

const ANIMATION_TIMES = {
    DATE: 0.2
};

const GnoteListViewItemBase = new Lang.Class({
    Name: 'GnoteListViewItemBase',
    Extends: ListViewItemBase.ListViewItemBase,

    _init: function(uri, gnote_integration) {
        this.parent({
            style_class: 'gnote-item-box',
            shortcut_style: 'gnote-shortcut-label'
        });

        this.uri = uri;
        this._gnote_integration = gnote_integration;
    },

    parse_note: function() {
        this.note = new GnoteNote.GnoteNote(this.uri);
        this.note.connect('notify::parsed', Lang.bind(this, this.on_note_parsed));
        this.note.start_parsing();
    },

    on_note_parsed: function() {
        this.title_label.set_text(this.note.title);

        let date_string = Utils.get_date_string(this.note.update_date);
        this.date_label.clutter_text.set_markup(
            this.date_label.change_template.format(date_string)
        );
    },

    init_title: function() {
        this.title_label = new St.Label({
            style_class: 'gnote-title-label',
            text: '...',
            style: 'font-size: %spx;'.format(
                Utils.SETTINGS.get_int(PrefsKeys.TITLE_SIZE_KEY)
            )
        });
    },

    init_date: function() {
        this.date_label = new St.Label({
            style_class: 'gnote-date-label',
            reactive: true,
            style: 'font-size: %spx;'.format(
                Utils.SETTINGS.get_int(PrefsKeys.DATE_SIZE_KEY)
            )
        });

        this.date_label.create_template =
            '<i>Created: <span weight="bold">%s</span></i>';
        this.date_label.change_template =
            '<i>Last changed: <span weight="bold">%s</span></i>';

        this.date_label.clutter_text.set_markup(
            this.date_label.change_template.format('...')
        );
        this.date_label.connect("enter-event", Lang.bind(this, function() {
            this.date_label.timeout_id = Mainloop.timeout_add(300,
                Lang.bind(this, function() {
                    this.date_label.hovered = true;
                    let date_string = Utils.get_date_string(this.note.create_date);
                    let new_text = this.date_label.create_template.format(
                        date_string
                    );
                    Utils.label_transition(
                        this.date_label,
                        new_text,
                        ANIMATION_TIMES.DATE
                    );
                })
            );
        }));
        this.date_label.connect("leave-event", Lang.bind(this, function() {
            if(this.date_label.timeout_id > 0) {
                Mainloop.source_remove(this.date_label.timeout_id);
            }

            if(this.date_label.hovered) {
                this.date_label.hovered = false;
                let date_string = Utils.get_date_string(this.note.update_date);
                let new_text = this.date_label.change_template.format(
                    date_string
                );
                Utils.label_transition(
                    this.date_label,
                    new_text,
                    ANIMATION_TIMES.DATE
                );
            }
        }));
    },

    init_buttons: function() {
        this.buttons = new GnoteListItemButtons.GnoteListItemButtons(
            this.uri,
            this._gnote_integration
        );
    }
});
