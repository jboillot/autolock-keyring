import * as Convenience from '@girs/gnome-shell/src/misc/extensionUtils';

const { Gtk } = imports.gi;

import type Gio_t from '@girs/gio-2.0';
import type Gtk_t from '@girs/gtk-4.0';

import { Settings } from './consts';

class PrefsWidget {
    w: Gtk_t.Grid;
    _settings: Gio_t.Settings;

    constructor(params?: Gtk_t.Grid.ConstructorProperties) {
        if (params === undefined) {
            params = {};
        }
        params.margin_top = 10;
        params.margin_start = 10;
        params.margin_end = 10;
        params.margin_bottom = 10;
        params.row_spacing = 6;

        this.w = new Gtk.Grid(params);
        this.w.set_orientation(Gtk.Orientation.VERTICAL);

        // eslint-disable-next-line
        this._settings = (Convenience as any).getSettings() as Gio_t.Settings;

        const showBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 7 });
        const showLabel = new Gtk.Label({
            label: 'Show the current lock status in top panel',
            hexpand: true,
            xalign: 0,
        });

        const showSwitch = new Gtk.Switch({ active: this._settings.get_boolean(Settings.SHOW_INDICATOR_KEY) });
        showSwitch.connect('notify::active', (button) => {
            this._settings.set_boolean(Settings.SHOW_INDICATOR_KEY, button.active);
        });

        showBox.prepend(showLabel);
        showBox.append(showSwitch);

        this.w.attach(showBox, 0, 0, 1, 1);

        const toMaxBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 7 });
        const toMaxLabel = new Gtk.Label({
            label: 'Time (in minutes) before relock (0 keeps it unlocked)',
            hexpand: true,
            xalign: 0,
        });

        const toMaxSpin = new Gtk.SpinButton({ halign: Gtk.Align.END });
        toMaxSpin.set_sensitive(true);
        toMaxSpin.set_range(0, 1440);
        toMaxSpin.set_increments(1, 5);
        toMaxSpin.set_value(this._settings.get_uint(Settings.TO_MAX));
        toMaxSpin.connect('value-changed', (v) => {
            this._settings.set_uint(Settings.TO_MAX, Math.max(0, v.get_value_as_int()));
        });

        toMaxBox.prepend(toMaxLabel);
        toMaxBox.append(toMaxSpin);

        this.w.attach(toMaxBox, 0, 1, 1, 1);
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function init() {}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildPrefsWidget() {
    const widget = new PrefsWidget();
    return widget.w;
}
