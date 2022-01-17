// adopted from shell 3.10 /usr/share/gnome-shell/js/appDisplay.js
const St = imports.gi.St;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Signals = imports.signals;
const Tweener = imports.tweener.tweener;

const INDICATORS_BASE_TIME = 0.25;
const INDICATORS_ANIMATION_DELAY = 0.125;
const INDICATORS_ANIMATION_MAX_TIME = 0.75;

const PageIndicators = new Lang.Class({
    Name:'DesktopNotesPageIndicators',

    _init: function() {
        this.actor = new St.BoxLayout({
            style_class: 'desktop-notes-page-indicators',
            vertical: false,
            reactive: true
        });
        this._n_pages = 0;
        this._current_page = undefined;
    },

    set_n_pages: function(n_pages) {
        if(this._n_pages === n_pages) return;

        let diff = n_pages - this._n_pages;

        if(diff > 0) {
            for(let i = 0; i < diff; i++) {
                let page_index = this._n_pages + i;
                let indicator = new St.Button({
                    style_class: 'desktop-notes-page-indicator',
                    button_mask:
                        St.ButtonMask.ONE
                        | St.ButtonMask.TWO
                        | St.ButtonMask.THREE,
                    toggle_mode: true,
                    checked: page_index === this._current_page
                });
                indicator.child = new St.Widget({
                    style_class: 'desktop-notes-page-indicator-icon'
                });
                indicator.connect('clicked',
                    Lang.bind(this, function() {
                        this.emit('page-activated', page_index);
                    })
                );
                this.actor.add_child(indicator);
                this.set_empty(i, true);
            }
        }
        else {
            let children = this.actor.get_children().splice(diff);

            for(let i = 0; i < children.length; i++) {
                children[i].destroy();
            }
        }

        this._n_pages = n_pages;
        this.actor.visible = (this._n_pages > 1);
    },

    set_current_page: function(current_page) {
        this._current_page = current_page;

        let children = this.actor.get_children();

        for(let i = 0; i < children.length; i++) {
            children[i].set_checked(i === this._current_page);
        }
    },

    set_empty: function(page, empty) {
        let children = this.actor.get_children();
        let child = children[page];

        if(!child) return;

        if(empty) {
            child.add_style_pseudo_class('empty');
        }
        else {
            child.remove_style_pseudo_class('empty');
        }
    },

    destroy: function() {
        this.actor.destroy();
    },

    get n_pages() {
        return this._n_pages;
    }
});
Signals.addSignalMethods(PageIndicators.prototype);
