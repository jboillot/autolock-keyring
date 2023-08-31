import { ExtensionMetadata } from '@girs/gnome-shell/src';
import * as Main from '@girs/gnome-shell/src/ui/main';
import * as PanelMenu from '@girs/gnome-shell/src/ui/panelMenu';
import * as Convenience from '@girs/gnome-shell/src/misc/extensionUtils';

const { Clutter, Gio, GObject, GLib, St } = imports.gi;

import type Gio_t from '@girs/gio-2.0';
import type GObject_t from '@girs/gobject-2.0';
import type St_t from '@girs/st-12';

import { Settings } from './consts';

const Me = Convenience.getCurrentExtension();

const IndicatorName = 'Auto-Lock Keyring';
const LockedIcon = '🔒';
const UnlockedIcon = '🔓';

let ExtensionIndicator: TExtension | undefined;

class TExtension extends PanelMenu.Button {
    _settings?: Gio_t.Settings;
    _connections: Map<GObject_t.Object, Set<number>>;

    _session?: Gio_t.DBusConnection;
    _monitor?: Gio_t.DBusConnection;
    _busWatchKeychainUnlockId: number;

    _isLocked: boolean;
    _lockLoopId: number;
    _latestKeyringUnlock = new Date().getTime();

    _indicatorLabel: St_t.Label;

    constructor() {
        super(0, IndicatorName);
        log(`enabling ${JSON.stringify(Me?.metadata, null, 2)}`);

        this._connections = new Map();

        // eslint-disable-next-line
        this._settings = (Convenience as any).getSettings() as Gio_t.Settings;

        this._connect(this._settings, `changed::${Settings.SHOW_INDICATOR_KEY}`, () => {
            if (this._settings?.get_boolean(Settings.SHOW_INDICATOR_KEY)) this.show();
            else this.hide();
        });
        if (!this._settings.get_boolean(Settings.SHOW_INDICATOR_KEY)) this.hide();

        // DBus
        this._session = Gio.DBus.session;

        this._monitor = Gio.DBusConnection.new_for_address_sync(
            Gio.dbus_address_get_for_bus_sync(Gio.BusType.SESSION, null),
            Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
            null,
            null,
        );
        this._monitor.call_sync(
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus.Monitoring',
            'BecomeMonitor',
            new GLib.Variant('(asu)', [["interface='org.freedesktop.Secret.Prompt',member='Completed'"], 0]),
            new GLib.VariantType('()'),
            Gio.DBusCallFlags.NONE,
            -1,
            null,
        );
        this._busWatchKeychainUnlockId = this._monitor.signal_subscribe(
            null,
            'org.freedesktop.Secret.Prompt',
            'Completed',
            null,
            null,
            Gio.DBusSignalFlags.NO_MATCH_RULE,
            () => {
                const now = new Date().getTime();
                this._latestKeyringUnlock = now;
                this._isLocked = false;
                this._indicatorLabel?.set_text(UnlockedIcon);
            },
        );

        this._lockLoopId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            if (!this._isLocked) {
                const now = new Date().getTime();
                const to_max = this._settings!.get_uint(Settings.TO_MAX);
                if (to_max > 0 && (now - this._latestKeyringUnlock) / 60000 >= to_max) {
                    this.forceLock();
                }
            }
            return GLib.SOURCE_CONTINUE;
        });

        this._isLocked = this.isCurrentlyLocked();
        this._indicatorLabel = new St.Label({
            text: this._isLocked ? LockedIcon : UnlockedIcon,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._indicatorLabel);
        this._connect(this, 'button-press-event', this.pressIcon.bind(this));
        this._connect(this, 'touch-event', this.pressIcon.bind(this));
    }

    override destroy(): void {
        this._disconnectAll();

        if (this._busWatchKeychainUnlockId) this._monitor?.signal_unsubscribe(this._busWatchKeychainUnlockId);
        this._busWatchKeychainUnlockId = 0;

        this._session?.close_sync(null);
        this._session = undefined;

        this._monitor?.close_sync(null);
        this._monitor = undefined;

        if (this._lockLoopId) GLib.Source.remove(this._lockLoopId);
        this._lockLoopId = 0;

        this._settings = undefined;

        super.destroy();
    }

    isCurrentlyLocked(): boolean {
        const reply = this._session!.call_sync(
            'org.freedesktop.secrets',
            '/org/freedesktop/secrets/collection/login',
            'org.freedesktop.DBus.Properties',
            'Get',
            new GLib.Variant('(ss)', ['org.freedesktop.Secret.Collection', 'Locked']),
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
        );
        const [result] = reply.recursiveUnpack<boolean[]>();
        return result;
    }

    forceLock() {
        this._session!.call_sync(
            'org.gnome.keyring',
            '/org/freedesktop/secrets',
            'org.freedesktop.Secret.Service',
            'LockService',
            new GLib.Variant('()', []),
            new GLib.VariantType('()'),
            Gio.DBusCallFlags.NONE,
            -1,
            null,
        );
        this._isLocked = true;
        this._indicatorLabel?.set_text(LockedIcon);
    }

    pressIcon() {
        if (!this._isLocked) {
            this.forceLock();
        }
    }

    /**
     * Connects to a gjs object and listens to a specific signal.
     * Keeps track of all connections, for easier disconnection.
     *
     * @argument {Object} target - the gjs object to connect to
     * @argument {String} signal - the signal listen to
     * @argument {Function} hook - the function to invoke when the signal is emitted
     */
    _connect(target: GObject_t.Object, signal: string, hook: (...args: any[]) => void) {
        if (target) {
            if (!this._connections.has(target)) this._connections.set(target, new Set());
            const set = this._connections.get(target)!;
            const id = target.connect(signal, hook);
            set.add(id);
        }
    }

    /**
     * Disconnects all connected signals
     */
    _disconnectAll() {
        for (const [target, ids] of this._connections) {
            if (target) {
                for (const id of ids) {
                    target.disconnect(id);
                }
            }
        }
        this._connections.clear();
    }
}

const Extension = GObject.registerClass(TExtension);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function init(extensionMeta: ExtensionMetadata) {}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function enable() {
    ExtensionIndicator = new Extension();
    Main.panel.addToStatusArea(IndicatorName, ExtensionIndicator);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function disable() {
    ExtensionIndicator?.destroy();
    ExtensionIndicator = undefined;
}
