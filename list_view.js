const St = imports.gi.St;
const Lang = imports.lang;
const Tweener = imports.ui.tweener;
const Signals = imports.signals;
const Panel = imports.ui.panel;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const ListViewItemBase = Me.imports.list_view_item_base;

const ListView = new Lang.Class({
    Name: "ListView",

    _init: function() {
        this.actor = new St.ScrollView({
            overlay_scrollbars: true,
            style_class: 'gnote-list-view-scrollbox'
        });
        this.actor.set_pivot_point(0.5, 0.5);

        this._box = new St.BoxLayout({
            vertical: true,
            style_class: 'gnote-list-view-box'
        });
        this.actor.add_actor(this._box);

        this._items = [];
        this._displayed_items = [];
        this._show_all = false;
    },

    _connect_item_signals: function(item) {
        item.actor.connect("enter-event",
            Lang.bind(this, function(o, e) {
                this.unselect_all();
                this.select(o);
            })
        );
        item.actor.connect("leave-event",
            Lang.bind(this, function(o, e) {
                this.unselect(o);
            })
        );
        item.actor.connect("button-press-event",
            Lang.bind(this, function(o, e) {
                this.actor.add_style_pseudo_class('active');
            })
        );
        item.actor.connect("button-release-event",
            Lang.bind(this, function(o, e) {
                let button = e.get_button();
                this.actor.remove_style_pseudo_class('active');
                this.emit("item-clicked", button, item);
            })
        );
    },

    _is_actor_visible_on_scroll: function(actor, scroll) {
        let v_adjustment = scroll.vscroll.adjustment;

        return (
            actor.y >= v_adjustment.value
            && actor.y + actor.height < (v_adjustment.value + v_adjustment.page_size)
        );
    },

    show_shortcuts: function() {
        let current_number = 1;

        for(let i = 0; i < this.displayed_length; i++) {
            let item = this._displayed_items[i];
            item.shortcut = 0;

            if(current_number > 1 && current_number <= 9) {
                item.shortcut = current_number;
                item.show_shortcut();
                current_number++;
            }
            else if(current_number >= 9) {
                continue;
            }
            else {
                if(this._is_actor_visible_on_scroll(item.actor, this.actor)) {
                    item.shortcut = current_number;
                    item.show_shortcut();
                    current_number++;
                }
            }
        }
    },

    hide_shortcuts: function() {
        for(let i = 0; i < this.displayed_length; i++) {
            let item = this._displayed_items[i];
            item.shortcut = 0;
            item.hide_shortcut();
        }
    },

    remove_item: function(item) {
        item.actor.set_pivot_point(0.5, 0.5);
        Tweener.removeTweens(item.actor);
        Tweener.addTween(item.actor, {
            time: 0.3,
            transition: 'easeOutQuad',
            opacity: 0,
            scale_y: 0,
            onComplete: Lang.bind(this, function() {
                let index = this.items.indexOf(item);
                let displayed_index = this._displayed_items.indexOf(item);

                if(index !== -1) {
                    this.items.splice(index, 1);
                    this.emit('items-changed');
                }
                if(displayed_index !== -1) {
                    this._displayed_items.splice(displayed_index, 1);
                    this.emit("displayed-items-changed");
                }

                item.destroy();
            })
        });
    },

    add_items: function(items) {
        for(let i = 0; i < items.length; i++) {
            let item = items[i];

            if(item instanceof ListViewItemBase.ListViewItemBase) {
                this.items.push(item);
                this._connect_item_signals(item);

                if(this._show_all) {
                    this.show_item(item);
                }
                else {
                    item.actor.hide();
                }
            }
            else {
                throw new Error('not ListViewItemBase instance');
            }
        }

        this.emit('items-changed');
    },

    set_items: function(items) {
        this.clear();
        this.add_items(items);
    },

    clear: function() {
        for(let i = 0; i < this.items.length; i++) {
            let item = this.items[i];
            item.destroy();
        }

        this._items = [];
        this._displayed_items = [];
        this.emit('items-changed');
        this.emit("displayed-items-changed");
    },

    show_item: function(item, emit_signal) {
        if(!item) {
            log("list_view.js:show_item(): Bad item '%s'".format(item));
            return;
        }

        emit_signal = emit_signal !== undefined ? emit_signal : true;

        if(this._displayed_items.indexOf(item) === -1) {
            this._box.add_child(item.actor);
            this._displayed_items.push(item);

            if(emit_signal) this.emit("displayed-items-changed");
        }

        item.show();
    },

    hide_item: function(item, emit_signal) {
        let index = this._displayed_items.indexOf(item);

        emit_signal = emit_signal !== undefined ? emit_signal : true;

        if(index !== -1) {
            this._displayed_items.splice(index, 1);

            if(emit_signal) this.emit("displayed-items-changed");
        }

        this._box.remove_child(item.actor);
        item.hide();
    },

    show_all: function() {
        this.hide_all();
        this._show_all = true;

        for(let i = 0; i < this.items.length; i++) {
            this.show_item(this.items[i], false);
        }

        this.emit("displayed-items-changed");
    },

    hide_all: function() {
        for(let i = 0; i < this.displayed_length; i++) {
            this._displayed_items[i].hide();
        }

        this._show_all = false;
        this._box.remove_all_children()
        this._displayed_items = [];
        this.emit("displayed-items-changed");
    },

    select_all: function() {
        for(let i = 0; i < this._displayed_items.length; i++) {
            this.select(this._displayed_items[i].actor);
        }
    },

    unselect_all: function() {
        for(let i = 0; i < this._displayed_items.length; i++) {
            this.unselect(this._displayed_items[i].actor);
        }
    },

    select: function(actor) {
        actor.add_style_pseudo_class("hover");
    },

    unselect: function(actor) {
        actor.remove_style_pseudo_class("hover");
    },

    get_selected: function() {
        let results = [];

        for(let i = 0; i < this._displayed_items.length; i++) {
            let item = this._displayed_items[i];

            if(item.actor.has_style_pseudo_class("hover")) {
                results.push(item);
            }
        }

        return results;
    },

    select_first: function() {
        if(this.displayed_length > 0) {
            this.unselect_all();
            this.select(this._displayed_items[0].actor);
        }
    },

    select_next: function() {
        let selected = this.get_selected();
        if(selected.length != 1) return;

        let next_actor = null;
        let children = this._box.get_children();

        for(let i = 0; i < children.length; i++) {
            if(children[i] == selected[0].actor) {
                next_actor = children[i+1];
                break;
            }
        }

        if(next_actor) {
            this.unselect_all();
            let vscroll = this.actor.vscroll.adjustment;

            if(!this._is_actor_visible_on_scroll(next_actor, this.actor)) {
                vscroll.value =
                    (next_actor.y + next_actor.height)
                    - vscroll.page_size;
            }

            this.select(next_actor);
        }
    },

    select_previous: function() {
        let selected = this.get_selected();
        if(selected.length != 1) return;

        let previous_actor = null;
        let children = this._box.get_children();

        for(let i = 0; i < children.length; i++) {
            if(children[i] == selected[0].actor && i > 0) {
                previous_actor = children[i-1];
                break;
            }
        }

        if(previous_actor) {
            this.unselect_all();
            let vscroll = this.actor.vscroll.adjustment;

            if(!this._is_actor_visible_on_scroll(previous_actor, this.actor)) {
                vscroll.value = previous_actor.y - previous_actor.height;
            }

            this.select(previous_actor);
        }
    },

    select_first_visible: function() {
        for(let i = 0; i < this.displayed_length; i++) {
            let item = this.displayed_items[i];

            if(this._is_actor_visible_on_scroll(item.actor, this.actor)) {
                this.select(item.actor);
                break;
            }
        }
    },

    get items() {
        return this._items;
    },

    get length() {
        return this._items.length
    },

    get displayed_items() {
        return this._displayed_items;
    },

    get displayed_length() {
        return this._displayed_items.length;
    },

    destroy: function() {
        for(let i = 0; i < this._items.length; i++) {
            let item = this.items[i];
            item.destroy();
        }

        this.actor.destroy();
    }
});
Signals.addSignalMethods(ListView.prototype);
