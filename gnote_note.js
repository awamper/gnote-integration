const St = imports.gi.St;
const Lang = imports.lang;
const Signals = imports.signals;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const Sax = Me.imports.libs.sax;

const REGEXPS = {
    TITLE: /<title>(.*?)<\/title>/,
    CONTENT: /<note-content.*?>([\s\S]*?)<\/note-content>/,
    CREATE_DATE: /<create-date>(.*?)<\/create-date>/,
    UPDATE_DATE: /<last-change-date>(.*?)<\/last-change-date>/,
    TAGS: /<tag>(.*?)<\/tag>/g,
    NOTEBOOK: /system:notebook:(.*)/
};
const LINK_TYPES = {
    URL: 0,
    NOTE: 1
};
const STATE_TYPES = {
    INIT: 0,
    PARSING: 1,
    PARSED: 2,
    ERROR: 3
}

const GnoteNote = new Lang.Class({
    Name: 'GnoteNote',

    _init: function(uri) {
        this.uri = uri.trim();

        this._title_size = Utils.SETTINGS.get_int(
            PrefsKeys.NOTE_TITLE_SIZE_KEY
        );
        this._content_size = Utils.SETTINGS.get_int(
            PrefsKeys.NOTE_CONTENTS_SIZE_KEY
        );

        this._xml = '';
        this._title = '';
        this._title_markup = '';
        this._content = '';
        this._markup = '';
        this._create_date = 0;
        this._update_date = 0;
        this._notebooks = [];
        this._tags = [];
        this._urls = [];

        this.STATES = {
            TITLE: STATE_TYPES.INIT,
            CONTENT: STATE_TYPES.INIT,
            MARKUP: STATE_TYPES.INIT,
            CREATE_DATE: STATE_TYPES.INIT,
            UPDATE_DATE: STATE_TYPES.INIT,
            TAGS: STATE_TYPES.INIT
        };
    },

    _check_uri: function(callback) {
        Utils.get_client().note_exists(this.uri,
            Lang.bind(this, function(result) {
                if(result !== true) {
                    let msg =
                        'GnoteIntegration:GnoteNote:_check_note: uri ' +
                        '"%s" doesn\'t exist'.format(this.uri);
                    throw new Error(msg)
                }

                callback(result);
            })
        );
    },

    _load_xml: function() {
        Utils.get_client().get_note_complete_xml(this.uri, Lang.bind(this, function(xml) {
            if(xml === false) {
                let msg =
                    'GnoteIntegration:GnoteNote:_load_xml: ' +
                    'Can\'t load xml data for "%s"'.format(this.uri);
                throw new Error(msg)
            }

            this._xml = xml;
            this._start_parsing();
        }))
    },

    _get_markup_tag: function(tag_name) {
        let link_color = '#ffffff';
        let result = false;
        let allowed_tags = {
            'note-content': {
                open: '',
                close: ''
            },
            'link:url': {
                open: '<span foreground="%s"><u>'.format(link_color),
                close: '</u></span>'
            }, 
            'link:internal': {
                open: '<span foreground="%s"><u>'.format(link_color),
                close: '</u></span>'
            },
            'list': {
                open: '',
                close: ''
            },
            'list-item': {
                open: '',
                close: ''
            },
            'bold': {
                open: '<b>',
                close: '</b>'
            },
            'italic': {
                open: '<i>',
                close: '</i>'
            },
            'strikethrough': {
                open: '<s>',
                close: '</s>'
            },
            'monospace': {
                open: '<tt>',
                close: '</tt>'
            },
            'highlight': {
                open: '<span background="yellow" foreground="black">',
                close: '</span>'
            },
            'size:small': {
                open: '<span size="x-small">',
                close: '</span>'
            },
            'size:large': {
                open: '<span size="large">',
                close: '</span>'
            },
            'size:huge': {
                open: '<span size="xx-large">',
                close: '</span>'
            }
        };

        if(tag_name in allowed_tags) result = allowed_tags[tag_name];

        return result;
    },

    _escape_markup: function(string) {
        string = string.replace(/&(?!amp;|quot;|apos;|lt;|gt;)/g, '&amp;');
        string = string.replace(/</g, '&lt;');
        return string;
    },

    _start_parsing: function() {
        this._parse_title();
        this._parse_content();
        this._parse_markup();
        this._parse_create_date();
        this._parse_udate_date();
        this._parse_tags();
    },

    _parse_title: function() {
        this.STATES.TITLE = STATE_TYPES.PARSING;
        let title = REGEXPS.TITLE.exec(this.xml);

        if(title !== null) {
            title = title[1];
        }
        else {
            title = 'UNDEFINED';
        }

        this._title = title;
        this.STATES.TITLE = STATE_TYPES.PARSED;

        if(this.is_parsed()) this._on_parsed();
    },

    _parse_content: function() {
        this.STATES.CONTENT = STATE_TYPES.PARSING;

        let strict = true;
        let parser = Sax.sax.parser(strict);
        let content = '';

        parser.onerror = Lang.bind(this, function(error) {
            log("GnoteIntegration:GnoteNote:_parse_content(): %s".format(error));
        });
        parser.ontext = Lang.bind(this, function(text) {
            content += text;
        });
        parser.onend = Lang.bind(this, function() {
            if(!Utils.is_blank(content)) {
                let title_end_index = content.indexOf('\n');
                content = content.substr(title_end_index);
            }
            else {
                content = "UNDEFINED";
            }

            this._content = content;
            this.STATES.CONTENT = STATE_TYPES.PARSED;

            if(this.is_parsed()) this._on_parsed();
        });

        let content_xml = REGEXPS.CONTENT.exec(this.xml)

        if(content_xml !== null) {
            content_xml = '<note-content>%s</note-content>'.format(content_xml[1]);
            parser.write(content_xml).close();
        }
        else {
            this._content = 'UNDEFINED';
            this.STATES.CONTENT = STATE_TYPES.PARSED;

            if(this.is_parsed()) this._on_parsed();
        }
    },

    _parse_markup: function() {
        this.STATES.MARKUP = STATE_TYPES.PARSING;
        let strict = true;
        let parser = Sax.sax.parser(strict);
        let note_markup = [];
        let list_level = 0;
        let list_item_prefix = '';
        let open_link = false;
        let text_length = 0;

        parser.onerror = Lang.bind(this, function(error) {
            log("GnoteIntegration:GnoteNote:_parse_markup(): %s".format(error));
        });
        parser.ontext = Lang.bind(this, function(text) {
            if(!Utils.is_blank(list_item_prefix)) {
                let last_tag = note_markup.pop();
                note_markup.push('<tt>%s</tt>'.format(list_item_prefix));
                note_markup.push(last_tag);
                text_length += list_item_prefix.length;
                list_item_prefix = '';
            }
            if(open_link !== false) {
                this._urls.push({
                    start_pos: text_length,
                    end_pos: text_length + text.length,
                    url: text,
                    type: open_link
                });
            }

            note_markup.push(this._escape_markup(text));
            text_length += text.length;
        });
        parser.onopentag = Lang.bind(this, function(node) {
            if(node.name === 'list') {
                list_level++;
            }
            if(node.name === 'list-item') {
                let indent = new Array(list_level + 1).join('   ');
                let level_symbols = ['\u2023', '\u2022', '\u25E6'];
                let current_symbol = level_symbols[list_level % 3];
                list_item_prefix = indent + current_symbol;
            }
            if(node.name === 'link:url') {
                open_link = LINK_TYPES.URL;
            }
            if(node.name === 'link:internal') {
                open_link = LINK_TYPES.NOTE
            }

            let markup_tag = this._get_markup_tag(node.name);

            if(!markup_tag) {
                // note_markup.push(this._escape_markup(node.name));
            }
            else {
                note_markup.push(markup_tag.open);
            }
        });
        parser.onclosetag= Lang.bind(this, function(name) {
            let markup_tag = this._get_markup_tag(name);

            if(!markup_tag) {
                // note_markup.push(this._escape_markup(name));
            }
            else {
                note_markup.push(markup_tag.close);
            }

            if(name === 'list') {
                list_level--;
            }
            if(name === 'link:url' || name === 'link:internal') {
                open_link = false;
            }
        });
        parser.onend = Lang.bind(this, function() {
            let markup = note_markup.join('');
            let title_end_index = markup.indexOf('\n');
            let title_markup = '<span font="%s">%s</span>'.format(
                this.title_size,
                markup.slice(0, title_end_index)
            );
            let content = markup.substr(title_end_index);
            let content_markup = '<span font="%s">%s</span>'.format(
                this.content_size,
                content.trim()
            );
            this._title_markup = title_markup;
            this._markup = content_markup;
            this.STATES.MARKUP = STATE_TYPES.PARSED;

            if(this.is_parsed()) this._on_parsed();
        });

        let content_xml = REGEXPS.CONTENT.exec(this.xml);

        if(content_xml !== null) {
            content_xml = '<note-content>%s</note-content>'.format(content_xml[1]);
            parser.write(content_xml).close();
        }
        else {
            this._markup = 'UNDEFINED';
            this.STATES.MARKUP = STATE_TYPES.PARSED;

            if(this.is_parsed()) this._on_parsed();
        }
    },

    _parse_create_date: function() {
        this.STATES.CREATE_DATE = STATE_TYPES.PARSING;
        let date_match = REGEXPS.CREATE_DATE.exec(this.xml)

        if(date_match !== null) {
            let date = new Date(date_match[1]);
            this._create_date = date.getTime();
        }
        else {
            this._create_date = 0;
        }

        this.STATES.CREATE_DATE = STATE_TYPES.PARSED;

        if(this.is_parsed()) this._on_parsed();
    },

    _parse_udate_date: function() {
        this.STATES.UPDATE_DATE = STATE_TYPES.PARSING;
        let date_match = REGEXPS.UPDATE_DATE.exec(this.xml)

        if(date_match !== null) {
            let date = new Date(date_match[1]);
            this._update_date = date.getTime();
        }
        else {
            this._update_date = 0;
        }

        this.STATES.UPDATE_DATE = STATE_TYPES.PARSED;

        if(this.is_parsed()) this._on_parsed();
    },

    _parse_tags: function() {
        this.STATES.TAGS = STATE_TYPES.PARSING;
        let tag_match, tags = [], notebooks = [];

        while((tag_match = REGEXPS.TAGS.exec(this.xml)) !== null) {
            let tag = tag_match[1];
            let notebook = REGEXPS.NOTEBOOK.exec(tag)

            if(notebook !== null) notebooks.push(notebook[1]);
            else tags.push(tag);
        }

        this._tags = tags;
        this._notebooks = notebooks;
        this.STATES.TAGS = STATE_TYPES.PARSED;

        if(this.is_parsed()) this._on_parsed();
    },

    _on_parsed: function() {
        this.emit('notify::parsed');
    },

    is_parsed: function() {
        for(let state in this.STATES) {
            if(this.STATES[state] !== STATE_TYPES.PARSED) return false;
        }

        return true;
    },

    start_parsing: function() {
        this._check_uri(Lang.bind(this, function(result) {
            if(result !== true) return;

            this._load_xml();
        }));
    },

    destroy: function() {
        // 
    },

    set title_size(size) {
        this._title_size = size;
    },

    get title_size() {
        return this._title_size;
    },

    set content_size(size) {
        this._content_size = size;
    },

    get content_size() {
        return this._content_size;
    },

    get xml() {
        return this._xml;
    },

    get urls() {
        return this._urls;
    },

    get title() {
        if(this.STATES.TITLE !== STATE_TYPES.PARSED) {
            throw new Error(
                'GnoteIntegration:GnoteNote: title is note parsed'
            );
        }

        return this._title;
    },

    get title_markup() {
        if(this.STATES.CONTENT !== STATE_TYPES.PARSED) {
            throw new Error(
                'GnoteIntegration:GnoteNote: content is note parsed'
            );
        }

        return this._title_markup;
    },

    get content() {
        if(this.STATES.CONTENT !== STATE_TYPES.PARSED) {
            throw new Error(
                'GnoteIntegration:GnoteNote: content is note parsed'
            );
        }

        return this._content;
    },

    get markup() {
        if(this.STATES.MARKUP !== STATE_TYPES.PARSED) {
            throw new Error(
                'GnoteIntegration:GnoteNote: markup is note parsed'
            );
        }

        return this._markup;
    },

    get create_date() {
        if(this.STATES.CREATE_DATE !== STATE_TYPES.PARSED) {
            throw new Error(
                'GnoteIntegration:GnoteNote: create date is note parsed'
            );
        }

        return this._create_date;
    },

    get update_date() {
        if(this.STATES.UPDATE_DATE !== STATE_TYPES.PARSED) {
            throw new Error(
                'GnoteIntegration:GnoteNote: update date is note parsed'
            );
        }

        return this._update_date;
    },

    get notebooks() {
        if(this.STATES.TAGS !== STATE_TYPES.PARSED) {
            throw new Error(
                'GnoteIntegration:GnoteNote: notebooks is note parsed'
            );
        }

        return this._notebooks;
    },

    get tags() {
        if(this.STATES.TAGS !== STATE_TYPES.PARSED) {
            throw new Error(
                'GnoteIntegration:GnoteNote: tags is note parsed'
            );
        }

        return this._tags;
    }
});
Signals.addSignalMethods(GnoteNote.prototype);
