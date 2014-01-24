const Lang = imports.lang;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Moment = Me.imports.libs.moment;
const PrefsKeys = Me.imports.prefs_keys;
const GnoteClient = Me.imports.gnote_client;
const TomboyClient = Me.imports.tomboy_client;

const ICONS = {
    PREFERENCES: 'preferences-system-symbolic',
    EDIT: 'text-editor-symbolic',
    DELETE: 'user-trash-symbolic',
    INDICATOR: 'text-editor-symbolic',
    SEARCH_INACTIVE: 'edit-find-symbolic',
    SEARCH_ACTIVE: 'edit-clear-symbolic',
    CREATE_NOTE: 'list-add-symbolic',
    SHOW_ON_DESKTOP: 'list-add-symbolic',
    PINNED: 'bookmark-new-symbolic',
    NOTE_COLOR: 'preferences-color-symbolic',
    RESIZE_NOTE: 'view-fullscreen-symbolic',
    PAGE: 'view-paged-symbolic',
    DESKTOP_NOTE_CLOSE: 'window-close-symbolic',
    HOME: 'go-home-symbolic',
    COPY: 'edit-copy-symbolic'
};

const SETTINGS = getSettings();

let _CLIENT = null;

function copy_note_content_to_clipboard(uri, remove_title, callback) {
    remove_title = remove_title || false;

    get_client().get_note_contents(uri,
        Lang.bind(this, function(result) {
            if(!result) {
                callback(false);
            }
            else {
                let content = result;

                if(remove_title) {
                    let title_end_index = content.indexOf('\n');
                    content = content.substr(title_end_index);
                }

                content = content.trim();
                let clipboard = St.Clipboard.get_default();
                clipboard.set_text(St.ClipboardType.CLIPBOARD, content);
                callback(true);
            }
        })
    )
}

function expand_path(path) {
    if(starts_with(path, '~')) {
        path = GLib.build_pathv('/', [GLib.get_home_dir(), path.substr(1)]);
    }

    return path;
}

function open_uri(path) {
    let uri;
    path = path.trim();

    if(starts_with(path, '/') || starts_with(path, '~')) {
        path = expand_path(path);
        let dir = Gio.file_new_for_path(path);

        if(!dir.query_exists(null)) {
            imports.ui.main.notify(
                'Cannot open location',
                'Path "%s" does not exist.'.format(path)
            );
            return;
        }

        uri = 'file://' + path;
    }
    else if(path.indexOf(':') === -1) {
        uri = 'http://' + path;
    }
    else {
        uri = path;
    }

    Gio.app_info_launch_default_for_uri(
        uri,
        global.create_app_launch_context()
    );
}

function is_double_click_event(clutter_event) {
    let button = clutter_event.get_button();
    let click_count = clutter_event.get_click_count();

    if(button === Clutter.BUTTON_PRIMARY && click_count === 2) {
        return true;
    }
    else {
        return false;
    }
}

function get_client() {
    let dbus_name = SETTINGS.get_string(PrefsKeys.DBUS_NAME_KEY);
    let clients = {
        'org.gnome.Gnote': GnoteClient.GnoteClient,
        'org.gnome.Tomboy': TomboyClient.TomboyClient
    };

    if(_CLIENT === null) {
        _CLIENT = new clients[dbus_name];
        _CLIENT.connect('destroy', Lang.bind(this, function() {
            _CLIENT = null;
        }));
    }

    return _CLIENT;
}

function launch_extension_prefs(uuid) {
    const Shell = imports.gi.Shell;

    let appSys = Shell.AppSystem.get_default();
    let app = appSys.lookup_app('gnome-shell-extension-prefs.desktop');
    app.launch(
        global.display.get_current_time_roundtrip(),
        ['extension:///' + uuid],
        -1,
        null
    );
}

function is_blank(str) {
    return (!str || /^\s*$/.test(str));
}

function starts_with(str1, str2) {
    return str1.slice(0, str2.length) == str2;
}

function ends_with(str1, str2) {
  return str1.slice(-str2.length) == str2;
}

function escape_html(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function get_unichar(keyval) {
    let ch = Clutter.keysym_to_unicode(keyval);

    if(ch) {
        return String.fromCharCode(ch);
    }
    else {
        return false;
    }
}

function wordwrap(str, width, brk, cut) {
    brk = brk || '\n';
    width = width || 75;
    cut = cut || false;

    if(!str) return str;

    let regex =
        '.{1,' + width + '}(\\s|$)' + (cut ? '|.{' + width +
        '}|.+$' : '|\\S+?(\\s|$)');

    return str.match(RegExp(regex, 'g')).join(brk);
}

function label_transition(label_actor, new_text, animation_time) {
    const Tweener = imports.ui.tweener;
    Tweener.addTween(label_actor, {
        time: animation_time,
        transition: "easeOutQuad",
        opacity: 50,
        onComplete: Lang.bind(this, function() {
            label_actor.clutter_text.set_markup(new_text);
            Tweener.addTween(label_actor, {
                time: animation_time,
                transition: "easeOutQuad",
                opacity: 255
            });
        })
    });
}

function get_lang_code() {
    let lang = GLib.environ_getenv(GLib.get_environ(), 'LANG');
    let result = 'en';

    if(lang === null) {
        return result;
    }

    let result = lang.split('_')[0];
    return result;
}

function get_date_string(unix_seconds) {
    Moment.moment.lang(get_lang_code());
    let moment_now = Moment.moment();
    let moment = Moment.moment(unix_seconds);
    let diff = moment_now.diff(moment, 'days');
    let result;

    if(diff <= 7) {
        result = moment.calendar();
    }
    else if (diff <= 30) {
        result = moment.fromNow();
    }
    else {
        result = moment.format('lll');
    }

    return result;
}

function is_pointer_inside_actor(actor, x, y) {
    let result = false;
    let [actor_x, actor_y] = actor.get_transformed_position();
    let [pointer_x, pointer_y] = global.get_pointer();

    if(x) pointer_x = x;
    if(y) pointer_y = y;

    if(
        pointer_x >= actor_x
        && pointer_x <= (actor_x + actor.width)
        && pointer_y >= actor_y
        && pointer_y <= (actor_y + actor.height)
    ) {
        result = true;
    }

    return result;
}

/**
 * getSettings:
 * @schema: (optional): the GSettings schema id
 *
 * Builds and return a GSettings schema for @schema, using schema files
 * in extensionsdir/schemas. If @schema is not provided, it is taken from
 * metadata['settings-schema'].
 */
function getSettings(schema) {
    let extension = ExtensionUtils.getCurrentExtension();

    schema = schema || extension.metadata['settings-schema'];

    const GioSSS = Gio.SettingsSchemaSource;

    // check if this extension was built with "make zip-file", and thus
    // has the schema files in a subfolder
    // otherwise assume that extension has been installed in the
    // same prefix as gnome-shell (and therefore schemas are available
    // in the standard folders)
    let schemaDir = extension.dir.get_child('schemas');
    let schemaSource;

    if(schemaDir.query_exists(null)) {
        schemaSource = GioSSS.new_from_directory(
            schemaDir.get_path(),
            GioSSS.get_default(),
            false
        );
    }
    else {
        schemaSource = GioSSS.get_default();
    }

    let schemaObj = schemaSource.lookup(schema, true);

    if(!schemaObj)
        throw new Error(
            'Schema '+schema+' could not be found for extension '
            +extension.metadata.uuid+'. Please check your installation.'
        );

    return new Gio.Settings({ settings_schema: schemaObj });
}

function escape_markup(string) {
    string = string.replace(/&(?!amp;|quot;|apos;|lt;|gt;)/g, '&amp;');
    string = string.replace(/</g, '&lt;');
    return string;
}

function preg_quote(str) {
    // http://kevin.vanzonneveld.net
    // +   original by: booeyOH
    // +   improved by: Ates Goral (http://magnetiq.com)
    // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +   bugfixed by: Onno Marsman
    // *     example 1: preg_quote("$40");
    // *     returns 1: '\$40'
    // *     example 2: preg_quote("*RRRING* Hello?");
    // *     returns 2: '\*RRRING\* Hello\?'
    // *     example 3: preg_quote("\\.+*?[^]$(){}=!<>|:");
    // *     returns 3: '\\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:'

    return (str + '').replace(/([\\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:])/g, "\\$1");
}
