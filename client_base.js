const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Signals = imports.signals;

const ClientBase = new Lang.Class({
    Name: "ClientBase",

    _init: function(client_name, dbus_name, dbus_path, proxy) {
        this.client_name = client_name;
        this.dbus_name = dbus_name;
        this.dbus_path = dbus_path;

        this._provider = new proxy(
            Gio.DBus.session,
            this.dbus_name,
            this.dbus_path
        );
        this._provider.connectSignal(
            'NoteAdded',
            Lang.bind(this, function(proxy, sender, [uri]) {
                this.emit('note-added', uri);
            })
        );
        this._provider.connectSignal(
            'NoteDeleted',
            Lang.bind(this, function(proxy, sender, [uri, title]) {
                this.emit('note-deleted', uri, title);
            })
        );
        this._provider.connectSignal(
            'NoteSaved',
            Lang.bind(this, function(proxy, sender, [uri]) {
                this.emit('note-saved', uri);
            })
        );
    },

    _return: function(result, error, method, callback) {
        if(result !== null) {
            if(typeof callback === 'function') callback(result[0]);
        }
        else {
            log("%s: %s: %s".format(this.client_name, method, error));
            if(typeof callback === 'function') callback(null, error);
        }
    },

    search_notes: function(query, case_sensitive, callback) {
        this._provider.SearchNotesRemote(
            query,
            case_sensitive,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'search_notes', callback);
            })
        );
    },

    list_all_notes: function(callback) {
        this._provider.ListAllNotesRemote(
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'list_all_notes', callback);
            })
        );
    },

    get_note_complete_xml: function(uri, callback) {
        this._provider.GetNoteCompleteXmlRemote(uri,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'get_note_complete_xml', callback);
            })
        );    
    },

    get_note_contents_xml: function(uri, callback) {
        this._provider.GetNoteContentsXmlRemote(uri,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'get_note_contents_xml', callback);
            })
        );
    },

    get_note_contents: function(uri, callback) {
        this._provider.GetNoteContentsRemote(uri,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'get_note_contents', callback);
            })
        );
    },

    get_note_create_date: function(uri, callback) {
        this._provider.GetNoteCreateDateRemote(uri,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'get_note_create_date', callback);
            })
        );        
    }, 

    get_note_change_date: function(uri, callback) {
        this._provider.GetNoteChangeDateRemote(uri,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'get_note_change_date', callback);
            })
        );        
    },

    get_note_title: function(uri, callback) {
        this._provider.GetNoteTitleRemote(uri,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'get_note_title', callback);
            })
        );
    },

    set_note_contents: function(uri, contents, callback) {
        this._provider.SetNoteContentsRemote(uri, contents,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'set_note_contents', callback);
            })
        );
    },

    note_exists: function(uri, callback) {
        this._provider.NoteExistsRemote(uri,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'note_exists', callback);
            })
        );
    },

    find_note: function(title, callback) {
        this._provider.FindNoteRemote(title,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'find_note', callback);
            })
        );
    },

    create_note: function(callback) {
        this._provider.CreateNoteRemote(
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'create_note', callback);
            })
        );
    },

    create_named_note: function(title, callback) {
        this._provider.CreateNamedNoteRemote(title,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'create_named_note', callback);
            })
        );
    },

    display_note: function(uri, callback) {
        this._provider.DisplayNoteRemote(uri,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'display_note', callback);
            })
        );
    },

    display_note_with_search: function(uri, term, callback) {
        this._provider.DisplayNoteWithSearchRemote(uri, term,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'display_search_with_text', callback);
            })
        );
    },

    display_search: function(callback) {
        this._provider.DisplaySearchRemote(
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'display_search', callback);
            })
        );
    },

    display_search_with_text: function(text, callback) {
        this._provider.DisplaySearchWithTextRemote(text,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'display_search_with_text', callback);
            })
        );
    },

    delete_note: function(uri, callback) {
        this._provider.DeleteNoteRemote(uri,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'delete_note', callback)
            })
        );
    },

    version: function(callback) {
        this._provider.VersionRemote(
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'version', callback);
            })
        );        
    },

    is_valid_uri: function(uri) {
        throw new Error('ClientBase:is_valid_uri(): not implemented');
    },

    destroy: function() {
        this._provider.run_dispose();
        this.emit('destroy');
    }
});
Signals.addSignalMethods(ClientBase.prototype);
