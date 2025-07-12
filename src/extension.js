/*********************************************************************
 * Highlight Focus is Copyright (C) 2025 michoelomichael
 *
 * Based on original work by Pim Snel
 *
 * Highlight Focus is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation
 *
 * Highlight Focus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Highlight Focus.  If not, see <http://www.gnu.org/licenses/>.
 **********************************************************************/

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import St from "gi://St";
import { wm } from "resource:///org/gnome/shell/ui/main.js";
import Clutter from "gi://Clutter"
import Cairo from "gi://cairo";

export default class HightlightCurrentWindow extends Extension {
  constructor(metadata) {
    super(metadata);
    this.handles_wm = [];
    this.handles_display = [];
    this.timeouts = [];
    this.sizing = false;
    this.borders = [];
    this.borderWidth = "2";
    this.borderColor = "#000000";
    this.borderRadius = "14";
  }

  enable() {
    this.handles_display.push(
      global.display.connect(
        "notify::focus-window",
        this.highlight_window.bind(this),
      ),
    );
    this.handles_display.push(
      global.display.connect("grab-op-begin", () => {
        this.remove_all_borders();
      }),
    );
    this.handles_display.push(
      global.display.connect("grab-op-end", () => {
        this.remove_all_borders();
        this.highlight_window();
      }),
    );
    this.handles_wm.push(
      global.window_manager.connect("size-change", () => {
        this.remove_all_borders();
        this.sizing = true;
      }),
    );
    this.handles_wm.push(
      global.window_manager.connect("size-changed", () => {
        this.sizing = false;
        this.highlight_window();
      }),
    );
    this.handles_wm.push(
      global.window_manager.connect("unminimize", () => {
        this.sizing = true;
      }),
    );
    this._settings = this.getSettings();
    this._settings.connect("changed::disable-hiding", () => {
      this.initSettings();
    });
    this._settings.connect("changed::hide-delay", () => {
      this.initSettings();
    });
    this._settings.connect("changed::border-width", () => {
      this.initSettings();
    });
    this._settings.connect("changed::border-radius", () => {
      this.initSettings();
    });
    this._settings.connect("changed::background-opacity", () => {
      this.initSettings();
    });
    this._settings.connect("changed::border-color", () => {
      this.initSettings();
    });

    this.initSettings();

    const flag = Meta.KeyBindingFlags.IGNORE_AUTOREPEAT;
    const mode = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW;
    wm.addKeybinding(
      "keybinding-highlight-now",
      this._settings,
      flag,
      mode,
      () => {
        this.highlight_window();
      },
    );
  }

  initSettings() {
    this.hideDelay = this._settings.get_int("hide-delay");
    this.borderWidth = this._settings.get_int("border-width");
    this.borderRadius = this._settings.get_int("border-radius");
    this.backgroundOpacityPercent = this._settings.get_int("background-opacity");
    this.borderColor = this._settings.get_string("border-color");
    this.disableHiding = this._settings.get_boolean("disable-hiding");
    this.highlight_window();
  }

  disable() {
    this.handles_display.splice(0).forEach((h) => global.display.disconnect(h));
    this.handles_wm.splice(0).forEach((h) => global.window_manager.disconnect(h));
    this.remove_all_timeouts();
    this.remove_all_borders();
    this.sizing = null;
    wm.removeKeybinding("keybinding-highlight-now");
    this._settings = null;
  }

  remove_all_borders() {
    this.borders.forEach((_border, index, object) => {
      if (_border && typeof _border.destroy !== "undefined") {
        _border.destroy();
        object.splice(index, 1);
      }
    });
  }

  remove_all_timeouts() {
    this.timeouts.splice(0).forEach((t) => {
      if (t) {
        GLib.Source.remove(t);
        t = null;
      }
    });
  }

  highlight_window() {
    this.timeouts.push(
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        this.sizing = false;
        return GLib.SOURCE_CONTINUE;
      }),
    );
    if (this.sizing) {
      console.error(`${sizing}`);
      return;
    }

    this.remove_all_borders();
    this.remove_all_timeouts();

    const win = global.display.focus_window;

    if (win == null) {
      console.error(`highlight-focus extension: Skipping window: ${win} with type '${win?.windowType}', maxh=${win?.maximized_horizontally}, maxv=${win?.maximized_vertically}`);
      return;
    }

    const winRect = win.get_frame_rect();
    const display = win.get_display();
    let radius = winHasSquareCorners(win) ? 0 : this.borderRadius;
    const borderInset = this.borderWidth/2;
    const borderThickness = this.borderWidth;
    const borderColorHex = this.borderColor;
    const backgroundOpacity = this.backgroundOpacityPercent / 100.0;
    let overallRect = winRect;

    for (let monitorIndex=0; monitorIndex < display.get_n_monitors(); monitorIndex++) {
      let monitorRect = display.get_monitor_geometry(monitorIndex);
      overallRect = overallRect.union(monitorRect);
    }

    const overlay = new St.Bin({
      x: overallRect.x,
      y: overallRect.y,
      width: overallRect.width,
      height: overallRect.height
    });

    this.borders.push(overlay);

    const drawing = new St.DrawingArea({
      x: overallRect.x,
      y: overallRect.y,
      width: overallRect.width,
      height: overallRect.height
    });

    drawing.connect("repaint", (area) => {
      const ctx = area.get_context();
      const [overallWidth, overallHeight] = area.get_surface_size();

      // Fill all monitors with a translucent background
      ctx.setSourceRGBA(0, 0, 0, backgroundOpacity);
      ctx.setOperator(Cairo.Operator.OVER);
      ctx.rectangle(0, 0, overallWidth, overallHeight);
      ctx.fill();

      // Punch out a hole in the middle for the active window
      ctx.setOperator(Cairo.Operator.CLEAR);
      createRectWithRoundedTopCornersPath(ctx, winRect.x, winRect.y, winRect.width, winRect.height, radius);
      ctx.fill();

      // If it's a fullscreen app on the primary monitor, it's probably screen-sharing, so we don't want to dim it.
      const primaryMonitorIndex = display.get_primary_monitor();
      if (display.get_monitor_in_fullscreen(primaryMonitorIndex)) {
        const monitorRect = display.get_monitor_geometry(primaryMonitorIndex);
        ctx.setOperator(Cairo.Operator.CLEAR);
        ctx.rectangle(monitorRect.x, monitorRect.y, monitorRect.width, monitorRect.height);
        ctx.fill();
      }

      // Draw a border around the active window
      ctx.setOperator(Cairo.Operator.OVER);
      createRectWithRoundedTopCornersPath(ctx, winRect.x+borderInset, winRect.y+borderInset, winRect.width-(2*borderInset), winRect.height-(2*borderInset), radius-borderInset);
      setCairoColorFromCSS(ctx, borderColorHex);
      ctx.setLineWidth(borderThickness);
      ctx.stroke();

      return Clutter.EVENT_STOP;
    });

    drawing.queue_repaint();
    overlay.set_child(drawing);
    overlay.show();
    global.window_group.add_child(overlay);

    if (!this.disableHiding) {
      this.timeouts.push(
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.hideDelay, () => {
          this.remove_all_borders();
          return GLib.SOURCE_CONTINUE;
        }),
      );
    }
  }
}

function winHasSquareCorners(win) {
  return (win.is_fullscreen() || (win.maximized_horizontally && win.maximized_vertically));
}

function createRectWithRoundedTopCornersPath(cr, x, y, w, h, radius) {

  radius = Math.max(0, radius);

  cr.newSubPath();

  // Top edge
  cr.moveTo(x+radius, y);
  cr.lineTo(x+w-radius, y);

  if (radius > 0) {
    // Top-right rounded corner
    cr.arc(x+w-radius, y+radius, radius, -Math.PI / 2, 0);
  }

  // Right edge, bottom edge, left edge
  cr.lineTo(x+w, y+h);
  cr.lineTo(x, y+h);
  cr.lineTo(x, y+radius);

  if (radius > 0) {
    // Top-left rounded corner
    cr.arc(x+radius, y+radius, radius, Math.PI, Math.PI * 1.5);
  }

  cr.closePath();
}

function setCairoColorFromCSS(ctx, hexColorWithHash) {
  ctx.setSourceRGB(
      parseInt(hexColorWithHash.substring(1, 3), 16) / 255,
      parseInt(hexColorWithHash.substring(3, 5), 16) / 255,
      parseInt(hexColorWithHash.substring(5, 7), 16) / 255,
  );
}