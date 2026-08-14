import Adw from "gi://Adw";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk";
import {
	ExtensionPreferences,
	gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class SimpleAiAssistantPreferences extends ExtensionPreferences {
	fillPreferencesWindow(window) {
		const settings = this.getSettings();
		const page = new Adw.PreferencesPage();
		window.add(page);

		// 1. API Group
		const apiGroup = new Adw.PreferencesGroup({title: _("API Settings")});
		page.add(apiGroup);

		const providerRow = new Adw.ComboRow({
			title: _("API Provider"),
			model: new Gtk.StringList({
				strings: [
					"OpenAI",
					"Gemini",
					"Claude",
					"DeepSeek",
					_("Custom (OpenAI Compatible)"),
				],
			}),
		});
		apiGroup.add(providerRow);

		// Define all rows
		const geminiKeyRow = new Adw.PasswordEntryRow({title: _("Gemini API Key")});
		const geminiModelRow = new Adw.EntryRow({title: _("Gemini Model")});
		const openaiKeyRow = new Adw.PasswordEntryRow({title: _("OpenAI API Key")});
		const openaiModelRow = new Adw.EntryRow({title: _("OpenAI Model")});
		const claudeKeyRow = new Adw.PasswordEntryRow({title: _("Claude API Key")});
		const claudeModelRow = new Adw.EntryRow({title: _("Claude Model")});
		const deepseekKeyRow = new Adw.PasswordEntryRow({
			title: _("DeepSeek API Key"),
		});
		const deepseekModelRow = new Adw.EntryRow({title: _("DeepSeek Model")});
		const customKeyRow = new Adw.PasswordEntryRow({
			title: _("Custom API Key"),
		});
		const customModelRow = new Adw.EntryRow({
			title: _("Custom Model"),
		});
		const customBaseUrlRow = new Adw.EntryRow({
			title: _("Custom Base URL"),
		});

		apiGroup.add(geminiKeyRow);
		apiGroup.add(geminiModelRow);
		apiGroup.add(openaiKeyRow);
		apiGroup.add(openaiModelRow);
		apiGroup.add(claudeKeyRow);
		apiGroup.add(claudeModelRow);
		apiGroup.add(deepseekKeyRow);
		apiGroup.add(deepseekModelRow);
		apiGroup.add(customKeyRow);
		apiGroup.add(customModelRow);
		apiGroup.add(customBaseUrlRow);

		settings.bind(
			"gemini-api-key",
			geminiKeyRow,
			"text",
			Gio.SettingsBindFlags.DEFAULT,
		);
		settings.bind(
			"gemini-model",
			geminiModelRow,
			"text",
			Gio.SettingsBindFlags.DEFAULT,
		);
		settings.bind(
			"openai-api-key",
			openaiKeyRow,
			"text",
			Gio.SettingsBindFlags.DEFAULT,
		);
		settings.bind(
			"openai-model",
			openaiModelRow,
			"text",
			Gio.SettingsBindFlags.DEFAULT,
		);
		settings.bind(
			"claude-api-key",
			claudeKeyRow,
			"text",
			Gio.SettingsBindFlags.DEFAULT,
		);
		settings.bind(
			"claude-model",
			claudeModelRow,
			"text",
			Gio.SettingsBindFlags.DEFAULT,
		);
		settings.bind(
			"deepseek-api-key",
			deepseekKeyRow,
			"text",
			Gio.SettingsBindFlags.DEFAULT,
		);
		settings.bind(
			"deepseek-model",
			deepseekModelRow,
			"text",
			Gio.SettingsBindFlags.DEFAULT,
		);
		settings.bind(
			"custom-api-key",
			customKeyRow,
			"text",
			Gio.SettingsBindFlags.DEFAULT,
		);
		settings.bind(
			"custom-model",
			customModelRow,
			"text",
			Gio.SettingsBindFlags.DEFAULT,
		);
		settings.bind(
			"custom-base-url",
			customBaseUrlRow,
			"text",
			Gio.SettingsBindFlags.DEFAULT,
		);

		const providerMap = ["openai", "gemini", "claude", "deepseek", "custom"];

		const rowsByProvider = {
			openai: [openaiKeyRow, openaiModelRow],
			gemini: [geminiKeyRow, geminiModelRow],
			claude: [claudeKeyRow, claudeModelRow],
			deepseek: [deepseekKeyRow, deepseekModelRow],
			custom: [customKeyRow, customModelRow, customBaseUrlRow],
		};

		// Set initial value BEFORE connecting signal to avoid triggering it
		const currentProvider = settings.get_string("api-provider");
		let initialIndex = providerMap.indexOf(currentProvider);
		if (initialIndex === -1) initialIndex = 1; // Default to Gemini
		providerRow.selected = initialIndex;

		// Now connect the signal after initial value is set
		providerRow.connect("notify::selected", () => {
			const val = providerMap[providerRow.selected] || "gemini";
			settings.set_string("api-provider", val);
			this._updateKeyVisibility(settings, rowsByProvider);
		});

		// Initial visibility update
		this._updateKeyVisibility(settings, rowsByProvider);

		// 2. Appearance Group
		const appearanceGroup = new Adw.PreferencesGroup({title: _("Appearance")});
		page.add(appearanceGroup);

		const widthRow = new Adw.ActionRow({
			title: _("Window Width"),
			subtitle: _("Adjust width (400px - 1200px)"),
		});
		const widthSpin = new Gtk.SpinButton({
			adjustment: new Gtk.Adjustment({
				lower: 400,
				upper: 1200,
				step_increment: 50,
				value: settings.get_int("chat-width"),
			}),
			valign: Gtk.Align.CENTER,
		});
		widthSpin.connect("value-changed", () => {
			settings.set_int("chat-width", widthSpin.get_value_as_int());
		});
		widthRow.add_suffix(widthSpin);
		appearanceGroup.add(widthRow);

		const heightRow = new Adw.ActionRow({
			title: _("Window Height"),
			subtitle: _("Adjust height (400px - 1600px)"),
		});
		const heightSpin = new Gtk.SpinButton({
			adjustment: new Gtk.Adjustment({
				lower: 400,
				upper: 1600,
				step_increment: 50,
				value: settings.get_int("chat-height"),
			}),
			valign: Gtk.Align.CENTER,
		});
		heightSpin.connect("value-changed", () => {
			settings.set_int("chat-height", heightSpin.get_value_as_int());
		});
		heightRow.add_suffix(heightSpin);
		appearanceGroup.add(heightRow);

		// 3. Keyboard Shortcut Group
		const shortcutGroup = new Adw.PreferencesGroup({title: _("Keyboard Shortcut")});
		page.add(shortcutGroup);

		const shortcutRow = new Adw.ActionRow({
			title: _("Open Assistant"),
			subtitle: _("Press keys to set shortcut, or leave empty to disable"),
		});

		const shortcutLabel = new Gtk.ShortcutLabel({
			accelerator: this._getShortcutString(settings),
			valign: Gtk.Align.CENTER,
		});

		const shortcutBtn = new Gtk.Button({
			label: "Set",
			valign: Gtk.Align.CENTER,
			margin_start: 8,
		});

		const clearBtn = new Gtk.Button({
			label: "Clear",
			valign: Gtk.Align.CENTER,
			margin_start: 4,
		});

		shortcutBtn.connect("clicked", () => {
			this._showShortcutDialog(window, settings, shortcutLabel);
		});

		clearBtn.connect("clicked", () => {
			settings.set_strv("keyboard-shortcut", []);
			shortcutLabel.accelerator = "";
		});

		shortcutRow.add_suffix(shortcutLabel);
		shortcutRow.add_suffix(shortcutBtn);
		shortcutRow.add_suffix(clearBtn);
		shortcutGroup.add(shortcutRow);

		// 4. General Settings Group
		const generalGroup = new Adw.PreferencesGroup({title: _("General Settings")});
		page.add(generalGroup);

		const historyRow = new Adw.ActionRow({
			title: _("History Context Limit"),
			subtitle: _("Messages kept in context (10-50)"),
		});
		const limitSpin = new Gtk.SpinButton({
			adjustment: new Gtk.Adjustment({
				lower: 10,
				upper: 50,
				step_increment: 1,
				value: settings.get_int("history-limit"),
			}),
			valign: Gtk.Align.CENTER,
		});
		limitSpin.connect("value-changed", () => {
			settings.set_int("history-limit", limitSpin.get_value_as_int());
		});
		historyRow.add_suffix(limitSpin);
		generalGroup.add(historyRow);

		const deviceInfoRow = new Adw.SwitchRow({
			title: _("Share System Details"),
			subtitle: _(
				"Sends CPU, GPU, RAM, and OS info to AI for better technical answers",
			),
		});
		generalGroup.add(deviceInfoRow);
		settings.bind(
			"send-device-info",
			deviceInfoRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT,
		);

		// 5. Information Group
		const infoGroup = new Adw.PreferencesGroup({title: _("Information")});
		page.add(infoGroup);

		const privacyRow = new Adw.ActionRow({
			title: _("Privacy"),
			subtitle: _(
				"No data is collected anywhere. All chat history is stored locally on your machine.",
			),
		});
		const privacyIcon = new Gtk.Image({
			icon_name: "security-high-symbolic",
		});
		privacyRow.add_prefix(privacyIcon);
		infoGroup.add(privacyRow);

		const creditsRow = new Adw.ActionRow({
			title: _("Developed by Momen Elkhalifa"),
			subtitle: _("Visit website: momen.codes"),
			activatable: true,
		});
		const creditsIcon = new Gtk.Image({
			icon_name: "avatar-default-symbolic",
		});
		creditsRow.add_prefix(creditsIcon);
		creditsRow.connect("activated", () => {
			GLib.spawn_command_line_async("xdg-open https://momen.codes");
		});
		infoGroup.add(creditsRow);
	}

	_updateKeyVisibility(settings, rowsByProvider) {
		const provider = settings.get_string("api-provider");
		for (const [id, rows] of Object.entries(rowsByProvider)) {
			const visible = id === provider;
			for (const row of rows) {
				row.visible = visible;
			}
		}
	}

	_getShortcutString(settings) {
		const shortcuts = settings.get_strv("keyboard-shortcut");
		return shortcuts.length > 0 ? shortcuts[0] : "";
	}

	_showShortcutDialog(window, settings, shortcutLabel) {
		const dialog = new Gtk.Dialog({
			title: "Set Keyboard Shortcut",
			transient_for: window,
			modal: true,
			default_width: 400,
			default_height: 150,
		});

		const contentArea = dialog.get_content_area();
		contentArea.spacing = 12;
		contentArea.margin_top = 20;
		contentArea.margin_bottom = 20;
		contentArea.margin_start = 20;
		contentArea.margin_end = 20;

		const label = new Gtk.Label({
			label: "Press a key combination...",
			halign: Gtk.Align.CENTER,
		});
		contentArea.append(label);

		const keyController = new Gtk.EventControllerKey();
		dialog.add_controller(keyController);

		keyController.connect("key-pressed", (controller, keyval, keycode, state) => {
			// Ignore modifier-only presses
			if (
				keyval === 65505 ||
				keyval === 65506 ||
				keyval === 65507 ||
				keyval === 65508 ||
				keyval === 65513 ||
				keyval === 65514 ||
				keyval === 65515 ||
				keyval === 65516
			) {
				return false;
			}

			// Get clean modifier state (remove lock modifiers)
			const mask = state & Gtk.accelerator_get_default_mod_mask();
			const accelerator = Gtk.accelerator_name(keyval, mask);

			if (accelerator) {
				settings.set_strv("keyboard-shortcut", [accelerator]);
				shortcutLabel.accelerator = accelerator;
				dialog.close();
			}

			return true;
		});

		dialog.present();
	}
}
