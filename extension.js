/*
 * Simple AI Assistant
 * Copyright (C) 2026 Momen Elkhalifa
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 */

import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import Pango from "gi://Pango";
import Shell from "gi://Shell";
import St from "gi://St";

import {Extension} from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";

import * as Api from "./api.js";
import * as Device from "./device.js";
import * as History from "./history.js";
import {SYSTEM_PROMPT} from "./prompts.js";
import * as Utils from "./utils.js";

const TIMEOUT_SECONDS = 60;

export default class SimpleAiAssistantExtension extends Extension {
	enable() {
		try {
			this._settings = this.getSettings();
			this._api = new Api.ApiClient();
			this._history = History.loadHistory() || [];
			this._cancellable = null;
			this._commandCancellable = null;

			this._indicator = new PanelMenu.Button(0.0, "Simple AI Assistant", false);

			try {
				const iconFile = this.dir.get_child("icon-symbolic.svg");
				if (iconFile.query_exists(null)) {
					const gicon = Gio.Icon.new_for_string(iconFile.get_path());
					const icon = new St.Icon();
					icon.gicon = gicon;
					icon.style_class = "system-status-icon";
					icon.icon_size = 16;
					this._indicator.add_child(icon);
				} else {
					const icon = new St.Icon();
					icon.icon_name = "starred-symbolic";
					icon.style_class = "system-status-icon";
					this._indicator.add_child(icon);
				}
			} catch (e) {
				console.warn(`Simple AI Assistant: Failed to load icon: ${e.message}`);
			}

			this._buildUi();
			Main.panel.addToStatusArea("simple-ai-assistant", this._indicator);

			// Keep the popup below the on-screen keyboard so the IME candidate
			// window (raised above the keyboard) stays above it instead of being
			// covered while typing.
			this._menuOpenId = this._indicator.menu.connect(
				"open-state-changed",
				(menu, open) => {
					if (!open) return;
					const parent = menu.actor.get_parent();
					const {keyboardBox} = Main.layoutManager;
					if (parent && keyboardBox) {
						parent.set_child_below_sibling(menu.actor, keyboardBox);
					}
				},
			);

			this._heightId = this._settings.connect("changed::chat-height", () =>
				this._updateSize(),
			);
			this._widthId = this._settings.connect("changed::chat-width", () =>
				this._updateSize(),
			);

			this._providerId = this._settings.connect("changed::api-provider", () =>
				this._updateApiReminder(),
			);
			this._updateApiReminder();

			// Register keyboard shortcut
			this._shortcutId = this._settings.connect("changed::keyboard-shortcut", () =>
				this._updateShortcut(),
			);
			this._updateShortcut();
		} catch (e) {
			console.error(`Simple AI Assistant: Enable Error: ${e.message}`);
		}
	}

	disable() {
		// Cancel any pending operations
		if (this._cancellable) {
			this._cancellable.cancel();
			this._cancellable = null;
		}
		if (this._commandCancellable) {
			this._commandCancellable.cancel();
			this._commandCancellable = null;
		}

		// Remove keyboard shortcut
		Main.wm.removeKeybinding("keyboard-shortcut");

		if (this._heightId) this._settings.disconnect(this._heightId);
		if (this._widthId) this._settings.disconnect(this._widthId);
		if (this._providerId) this._settings.disconnect(this._providerId);
		if (this._shortcutId) this._settings.disconnect(this._shortcutId);
		if (this._menuOpenId) {
			this._indicator.menu.disconnect(this._menuOpenId);
			this._menuOpenId = null;
		}
		if (this._indicator) this._indicator.destroy();
		this._indicator = null;
		this._settings = null;
		this._api = null;
		this._chatContainer = null;
	}

	_updateShortcut() {
		// Remove existing binding
		Main.wm.removeKeybinding("keyboard-shortcut");

		const shortcut = this._settings.get_strv("keyboard-shortcut");
		if (shortcut && shortcut.length > 0 && shortcut[0]) {
			Main.wm.addKeybinding(
				"keyboard-shortcut",
				this._settings,
				Meta.KeyBindingFlags.NONE,
				Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
				() => {
					if (this._indicator) {
						this._indicator.menu.toggle();
					}
				},
			);
		}
	}

	_updateSize() {
		if (!this._chatContainer) return;

		const monitor = Main.layoutManager.primaryMonitor;
		const maxWidth = monitor.width * 0.9;
		const maxHeight = Math.floor(monitor.height * 0.55);

		// Default to 40% height if unset or too small, otherwise use setting
		let targetHeight = this._settings.get_int("chat-height");
		if (targetHeight < 100) targetHeight = Math.floor(monitor.height * 0.4);

		let targetWidth = this._settings.get_int("chat-width");
		if (targetWidth < 100) targetWidth = 500;

		this._chatContainer.width = Math.min(targetWidth, maxWidth);
		this._chatContainer.height = Math.min(targetHeight, maxHeight);
	}

	_buildUi() {
		this._chatContainer = new St.BoxLayout();
		this._chatContainer.vertical = true;
		this._chatContainer.style_class = "saia-chat-container";

		this._updateSize();

		const header = new St.BoxLayout();
		header.style_class = "saia-chat-header";

		const title = new St.Label();
		title.text = "Simple AI Assistant";
		title.x_expand = true;
		title.y_align = Clutter.ActorAlign.CENTER;

		const settingsBtn = new St.Button();
		settingsBtn.style_class = "saia-settings-button";
		settingsBtn.y_align = Clutter.ActorAlign.CENTER;
		const sIcon = new St.Icon();
		sIcon.icon_name = "emblem-system-symbolic";
		sIcon.icon_size = 16;
		settingsBtn.set_child(sIcon);
		settingsBtn.connect("clicked", () => this.openPreferences());

		const newChatBtn = new St.Button();
		newChatBtn.style_class = "saia-button";
		newChatBtn.y_align = Clutter.ActorAlign.CENTER;
		newChatBtn.label = "New Chat";
		newChatBtn.connect("clicked", () => this._newChat());

		header.add_child(title);
		header.add_child(settingsBtn);
		header.add_child(newChatBtn);
		this._chatContainer.add_child(header);

		this._chatScroll = new St.ScrollView();
		this._chatScroll.style_class = "saia-chat-scroll";
		this._chatScroll.x_expand = true;
		this._chatScroll.y_expand = true;
		this._chatScroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);

		this._chatBox = new St.BoxLayout();
		this._chatBox.vertical = true;
		this._chatBox.style_class = "saia-chat-box";

		this._chatScroll.add_child(this._chatBox);
		this._chatContainer.add_child(this._chatScroll);

		// Input Area + API Reminder
		const bottomArea = new St.BoxLayout();
		bottomArea.vertical = true;

		this._apiReminder = new St.Label({
			style_class: "saia-api-reminder",
			text: "⚠️ Please add your API Key in settings if you haven't already",
			visible: false,
		});
		bottomArea.add_child(this._apiReminder);

		const inputArea = new St.BoxLayout({
			style_class: "saia-chat-input-area",
		});
		inputArea.style = "spacing: 8px;";

		this._input = new St.Entry();
		this._input.style_class = "saia-chat-input";
		this._input.hint_text = "Type a message...";
		this._input.x_expand = true;
		this._input.clutter_text.connect("activate", () => this._sendMessage());

		// Send Button
		this._sendBtn = new St.Button({
			style_class: "saia-send-button",
			can_focus: true,
			reactive: true, // starts enabled, but updated logic below
		});
		const sendIcon = new St.Icon({
			icon_name: "go-next-symbolic", // Simple arrow right
			icon_size: 16,
		});
		this._sendBtn.set_child(sendIcon);
		this._sendBtn.connect("clicked", () => this._sendMessage());

		// Monitor input to enable/disable send button
		this._input.clutter_text.connect("notify::text", () => {
			const text = this._input.get_text();
			this._sendBtn.reactive = text && text.trim().length > 0;
			this._sendBtn.opacity = this._sendBtn.reactive ? 255 : 128;
		});
		// Initial state
		this._sendBtn.reactive = false;
		this._sendBtn.opacity = 128;

		inputArea.add_child(this._input);
		inputArea.add_child(this._sendBtn);
		bottomArea.add_child(inputArea);

		this._chatContainer.add_child(bottomArea);

		// Populate content
		if (this._history && this._history.filter(m => m.role !== "system").length > 0) {
			this._history
				.filter(m => m.role !== "system")
				.forEach(m => this._addMessageToUi(m.role, m.content, m));
		} else {
			this._showEmptyState();
		}

		this._indicator.menu.box.add_child(this._chatContainer);

		// Autofocus when menu opens
		this._indicator.menu.connect("opened", () => {
			this._input.grab_key_focus();
		});
	}

	_showEmptyState() {
		this._chatBox.destroy_all_children();

		this._emptyState = new St.BoxLayout({
			vertical: true,
			style_class: "saia-empty-state",
			x_expand: true,
			y_expand: true,
			y_align: Clutter.ActorAlign.CENTER,
		});
		this._emptyState.style = "spacing: 15px;";

		const title = new St.Label({
			text: "What can I help with today?",
			style_class: "saia-empty-state-title",
		});
		this._emptyState.add_child(title);

		const examples = [
			"My bluetooth doesn't turn on",
			"Check why my system's resource usage is high",
			"How to take a screenshot in GNOME?",
		];

		examples.forEach(ex => {
			const btn = new St.Button({
				label: ex,
				style_class: "saia-example-chip",
				x_align: Clutter.ActorAlign.CENTER,
			});
			btn.connect("clicked", () => {
				this._input.text = ex;
				this._sendMessage();
			});
			this._emptyState.add_child(btn);
		});

		this._chatBox.add_child(this._emptyState);
	}

	_updateApiReminder() {
		if (!this._apiReminder) return;
		const provider = this._settings.get_string("api-provider");
		const key = this._settings.get_string(`${provider}-api-key`);
		this._apiReminder.visible = !key;
	}

	async _sendMessage() {
		const text = this._input.get_text();
		if (!text || !text.trim()) return;
		this._input.set_text("");

		// Reset send button state
		this._sendBtn.reactive = false;
		this._sendBtn.opacity = 128;

		if (this._emptyState) {
			this._chatBox.remove_child(this._emptyState);
			this._emptyState = null;
		}

		if (this._history.length === 0 || this._history[0].role !== "system") {
			this._history.unshift({role: "system", content: SYSTEM_PROMPT});
		}

		if (
			this._history.filter(m => m.role !== "system").length === 0 &&
			this._settings.get_boolean("send-device-info")
		) {
			const info = Device.getDeviceInfo();
			if (!this._history[0].content.includes("User System Info:")) {
				this._history[0].content += "\n\nUser System Info:\n" + info;
			}
		}

		const msg = {role: "user", content: text};
		this._history.push(msg);
		this._addMessageToUi(msg.role, msg.content, msg);
		await this._getAiResponse();
	}

	async _getAiResponse() {
		try {
			this._updateApiReminder();
			const provider = this._settings.get_string("api-provider");
			const apiKey = this._settings.get_string(`${provider}-api-key`);
			const model = this._settings.get_string(`${provider}-model`);
			const baseUrl =
				provider === "custom"
					? this._settings.get_string("custom-base-url")
					: null;

			if (!apiKey) {
				this._addMessageToUi(
					"assistant",
					"<b>API Key missing!</b> Please go to settings.",
				);
				return;
			}

			// Create loading message with cancel button
			const loadingBox = new St.BoxLayout({
				vertical: false,
				style_class: "saia-message-box saia-assistant-message",
			});
			const loadingLabel = new St.Label({
				text: "Thinking...",
				style_class: "saia-message-text",
				y_align: Clutter.ActorAlign.CENTER,
			});
			loadingLabel.style = "margin-right: 12px;"; // Added gap
			loadingBox.add_child(loadingLabel);

			const cancelBtn = new St.Button({
				label: "Cancel",
				style_class: "saia-cancel-button",
				x_align: Clutter.ActorAlign.START,
				y_align: Clutter.ActorAlign.CENTER,
			});
			this._cancellable = new Gio.Cancellable();
			cancelBtn.connect("clicked", () => {
				if (this._cancellable) {
					this._cancellable.cancel();
				}
			});
			loadingBox.add_child(cancelBtn);
			this._chatBox.add_child(loadingBox);
			this._scrollToBottom();

			try {
				const response = await this._api.sendMessage(
					provider,
					apiKey,
					model,
					this._history,
					this._cancellable,
					baseUrl,
				);

				this._chatBox.remove_child(loadingBox);
				this._cancellable = null;

				const msg = {role: "assistant", content: response};
				this._history.push(msg);
				this._addMessageToUi(msg.role, msg.content, msg);
				History.saveHistory(
					this._history,
					this._settings.get_int("history-limit"),
				);
			} catch (e) {
				this._chatBox.remove_child(loadingBox);
				this._cancellable = null;

				if (e.matches && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
					this._addMessageToUi("assistant", "_Request cancelled._");
				} else {
					this._addMessageToUi("assistant", `Error: ${e.message}`);
				}
			}
		} catch (e) {
			this._addMessageToUi("assistant", `Error: ${e.message}`);
		}
	}

	_newChat() {
		// Cancel any pending operations
		if (this._cancellable) {
			this._cancellable.cancel();
			this._cancellable = null;
		}
		if (this._commandCancellable) {
			this._commandCancellable.cancel();
			this._commandCancellable = null;
		}

		this._history = [];
		History.clearHistory();
		this._chatBox.destroy_all_children();
		this._showEmptyState();
	}

	_setEntryHeight(entry) {
		let lastHeight = 0;
		const adjust = () => {
			GLib.idle_add(GLib.PRIORITY_LOW, () => {
				const width = entry.get_width();
				if (width > 1) {
					const [, natHeight] = entry.clutter_text.get_preferred_height(width);
					if (Math.abs(lastHeight - natHeight) > 1) {
						lastHeight = natHeight;
						entry.set_height(natHeight + 4);
					}
				}
				return GLib.SOURCE_REMOVE;
			});
		};
		entry.connect("notify::allocation", adjust);
		GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
			adjust();
			return GLib.SOURCE_REMOVE;
		});
	}

	_makeSelectableEntry(styleClass, style, opts = {}) {
		const entry = new St.Entry({
			style_class: styleClass,
			style: style || "",
			reactive: true,
			can_focus: true,
			x_expand: true,
			y_expand: false,
			x_align: Clutter.ActorAlign.FILL,
			y_align: Clutter.ActorAlign.START,
		});
		entry.clutter_text.single_line_mode = false;
		entry.clutter_text.line_wrap = opts.lineWrap !== false;
		entry.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
		entry.clutter_text.editable = false;
		entry.clutter_text.selectable = true;
		if (opts.wrapMode) {
			entry.clutter_text.line_wrap_mode = opts.wrapMode;
		}
		return entry;
	}

	_renderBlock(block, isCommandOutput, textStyle) {
		if (block.type === "code") {
			return this._createCodeBlock(block.content);
		}
		if (block.type === "table") {
			const entry = this._makeSelectableEntry("saia-table-text", textStyle, {
				lineWrap: false,
			});
			try {
				entry.clutter_text.set_markup(Utils.formatTable(block.content));
			} catch (e) {
				entry.clutter_text.set_text(block.content);
			}
			this._setEntryHeight(entry);
			return entry;
		}
		const entry = this._makeSelectableEntry(
			isCommandOutput ? "saia-terminal-text" : "saia-message-text",
			textStyle,
		);
		try {
			entry.clutter_text.set_markup(Utils.formatMessage(block.content));
		} catch (e) {
			entry.clutter_text.set_text(block.content);
		}
		this._setEntryHeight(entry);
		return entry;
	}

	_createCodeBlock(code) {
		const container = new St.BoxLayout({
			vertical: true,
			style_class: "saia-code-block",
			x_expand: true,
		});
		const entry = this._makeSelectableEntry(
			"saia-code-text",
			"color: #f8f8f2; selected-color: #f8f8f2;",
			{ wrapMode: Pango.WrapMode.WORD_CHAR },
		);
		entry.clutter_text.set_text(code);
		this._setEntryHeight(entry);
		container.add_child(entry);
		return container;
	}

	_createCommandOutput(content, textStyle) {
		const newlineIdx = content.indexOf("\n");
		const headerText = newlineIdx === -1 ? content : content.slice(0, newlineIdx);
		const bodyText = newlineIdx === -1 ? "" : content.slice(newlineIdx + 1);

		const container = new St.BoxLayout({
			vertical: true,
			x_expand: true,
		});

		const headerBtn = new St.Button({
			style_class: "saia-command-header",
			reactive: true,
			can_focus: true,
			x_expand: true,
		});
		const headerBox = new St.BoxLayout({ vertical: false, style: "spacing: 6px;" });
		const arrow = new St.Icon({ icon_name: "pan-end-symbolic", icon_size: 12 });
		const headerLabel = new St.Label({
			text: headerText,
			style_class: "saia-terminal-text",
			x_expand: true,
			x_align: Clutter.ActorAlign.START,
			y_align: Clutter.ActorAlign.CENTER,
		});
		headerLabel.clutter_text.line_wrap = true;
		headerLabel.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
		headerBox.add_child(arrow);
		headerBox.add_child(headerLabel);
		headerBtn.set_child(headerBox);
		container.add_child(headerBtn);

		if (bodyText) {
			const body = this._makeSelectableEntry(
				"saia-terminal-text",
				textStyle,
				{ wrapMode: Pango.WrapMode.WORD_CHAR },
			);
			body.clutter_text.set_text(bodyText);
			this._setEntryHeight(body);
			body.visible = false;
			container.add_child(body);

			let expanded = false;
			headerBtn.connect("clicked", () => {
				expanded = !expanded;
				arrow.icon_name = expanded ? "pan-down-symbolic" : "pan-end-symbolic";
				body.visible = expanded;
			});
		}

		return container;
	}

	_addMessageToUi(role, content, messageObj = null) {
		if (!content) return null;
		if (this._emptyState) {
			this._chatBox.remove_child(this._emptyState);
			this._emptyState = null;
		}

		const isCommandOutput =
			content.startsWith('COMMAND OUTPUT for "') ||
			content.startsWith('COMMAND ERROR for "') ||
			content.startsWith('COMMAND TIMEOUT for "');

		// Main container for the message row
		const msgRow = new St.BoxLayout({
			vertical: true,
			x_expand: true,
			x_align: isCommandOutput
				? Clutter.ActorAlign.START
				: role === "user"
					? Clutter.ActorAlign.END
					: Clutter.ActorAlign.FILL,
		});

		msgRow.style_class = isCommandOutput
			? "saia-command-output-container"
			: role === "user"
				? "saia-user-msg-container"
				: "saia-assistant-msg-container";

		// The bubble itself (visual container)
		const bubbleWidget = new St.BoxLayout({
			vertical: false,
			style: "spacing: 8px;",
			x_expand: false,
			y_expand: false,
			x_align: isCommandOutput
				? Clutter.ActorAlign.START
				: role === "user"
					? Clutter.ActorAlign.END
					: Clutter.ActorAlign.START,
		});

		// Apply style class to the bubble widget
		if (isCommandOutput) {
			bubbleWidget.style_class = "saia-terminal-box";
			bubbleWidget.x_expand = true; // Command outputs should show their importance
		} else {
			bubbleWidget.style_class =
				role === "user" ? "saia-user-bubble" : "saia-assistant-bubble";
			if (role !== "user") {
				bubbleWidget.x_expand = true;
			}
		}

		// 1. Message Text
		// Use St.Entry (editable=false) instead of St.Label: St.Label's text is
		// not selectable in GNOME Shell, while a read-only St.Entry allows mouse
		// drag-selection and copy.
		// Text color is handled via CSS `color: inherit` so it follows the
		// system light/dark color-scheme automatically.
		const textStyle = "";

		if (isCommandOutput) {
			bubbleWidget.add_child(this._createCommandOutput(content, textStyle));
		} else {
			const blocks = Utils.parseBlocks(content);
			if (blocks.length === 1 && blocks[0].type === "text") {
				const label = this._makeSelectableEntry("saia-message-text", textStyle);
				try {
					label.clutter_text.set_markup(Utils.formatMessage(blocks[0].content));
				} catch (e) {
					label.clutter_text.set_text(blocks[0].content);
				}
				this._setEntryHeight(label);
				bubbleWidget.add_child(label);
			} else {
				const blockContainer = new St.BoxLayout({
					vertical: true,
					x_expand: true,
					style: "spacing: 6px;",
				});
				for (const block of blocks) {
					const widget = this._renderBlock(block, isCommandOutput, textStyle);
					if (widget) blockContainer.add_child(widget);
				}
				bubbleWidget.add_child(blockContainer);
			}
		}

		// 2. Copy Button (Overlay - Top Right)
		const copyBtn = new St.Button({
			style_class: "saia-copy-button",
			x_align: Clutter.ActorAlign.END,
			y_align: Clutter.ActorAlign.START,
			x_expand: false,
			y_expand: false,
		});
		const copyIcon = new St.Icon({icon_name: "edit-copy-symbolic", icon_size: 14});
		copyBtn.set_child(copyIcon);
		copyBtn.connect("clicked", () => {
			const clipboard = St.Clipboard.get_default();
			clipboard.set_text(St.ClipboardType.CLIPBOARD, content);
			copyIcon.icon_name = "emblem-ok-symbolic";
			GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
				copyIcon.icon_name = "edit-copy-symbolic";
				return false;
			});
		});
		bubbleWidget.add_child(copyBtn);

		msgRow.add_child(bubbleWidget);

		// Run Buttons
		const matches = content.matchAll(/\[RUN: (.*?)\]/g);
		for (const m of matches) {
			const cmd = m[1];

			// Check if already executed in history
			const isExecuted =
				messageObj &&
				messageObj.executed_commands &&
				messageObj.executed_commands.includes(cmd);

			if (isExecuted) continue;

			const btn = new St.Button();
			btn.style_class = "saia-run-button";
			btn.label = `Run: ${cmd.length > 25 ? cmd.substring(0, 25) + "..." : cmd}`;
			btn.x_align = Clutter.ActorAlign.START;

			btn.connect("clicked", () => {
				btn.hide();
				this._runCommand(cmd, msgRow, messageObj);
			});
			msgRow.add_child(btn);
		}

		this._chatBox.add_child(msgRow);
		this._scrollToBottom();
		return msgRow;
	}

	_scrollToBottom() {
		GLib.idle_add(GLib.PRIORITY_LOW, () => {
			if (this._chatScroll) {
				const adj = this._chatScroll.vadjustment;
				adj.value = adj.upper - adj.page_size;
			}
			return false;
		});
	}

	async _runCommand(cmd, msgBox, messageObj = null) {
		const box = new St.BoxLayout();
		box.vertical = true;
		box.style_class = "saia-terminal-box";

		const headerBox = new St.BoxLayout();
		const terminalStyle = "";
		const label = new St.Entry({
			style_class: "saia-terminal-text",
			style: terminalStyle,
			reactive: true,
			can_focus: true,
			x_expand: true,
			y_align: Clutter.ActorAlign.CENTER,
		});
		label.clutter_text.single_line_mode = false;
		label.clutter_text.editable = false;
		label.clutter_text.selectable = true;
		label.set_text("Executing...");
		this._setEntryHeight(label);
		headerBox.add_child(label);

		// Cancel button for command execution
		const cancelBtn = new St.Button({
			label: "Cancel",
			style_class: "saia-cancel-button",
			x_align: Clutter.ActorAlign.START,
		});
		this._commandCancellable = new Gio.Cancellable();
		let commandPid = null;

		cancelBtn.connect("clicked", () => {
			if (this._commandCancellable) {
				this._commandCancellable.cancel();
			}
			if (commandPid) {
				try {
					GLib.spawn_command_line_async(`kill ${commandPid}`);
				} catch (e) {
					// Ignore kill errors
				}
			}
			label.set_text("Cancelled");
		});
		headerBox.add_child(cancelBtn);

		const copyBtn = new St.Button({
			style_class: "saia-copy-button",
			visible: false,
		});
		const copyIcon = new St.Icon({icon_name: "edit-copy-symbolic", icon_size: 14});
		copyBtn.set_child(copyIcon);
		copyBtn.connect("clicked", () => {
			const clipboard = St.Clipboard.get_default();
			clipboard.set_text(St.ClipboardType.CLIPBOARD, label.text);
			copyIcon.icon_name = "emblem-ok-symbolic";
			GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
				copyIcon.icon_name = "edit-copy-symbolic";
				return false;
			});
		});
		headerBox.add_child(copyBtn);

		box.add_child(headerBox);
		box.add_child(label); // Separate label for output
		msgBox.add_child(box);

		try {
			// Check if command requires sudo - use pkexec for native password dialog and output capture
			let actualCmd = cmd;
			if (cmd.trim().startsWith("sudo ")) {
				const innerCmd = cmd.trim().substring(5);
				// Use -- to ensure arguments are handled correctly
				actualCmd = `pkexec bash -c '${innerCmd.replace(/'/g, "'\\''")}'`;
				label.set_text("Authentication required...");
			}

			const [res, stdout, stderr, exitStatus] =
				await this._spawnCommandLineAsyncWithTimeout(actualCmd, TIMEOUT_SECONDS);
			cancelBtn.hide();

			const decoder = new TextDecoder("utf-8");
			const out = decoder.decode(new Uint8Array(stdout.get_data())).trim();
			const err = decoder.decode(new Uint8Array(stderr.get_data())).trim();

			let result = out || err;
			if (!result) {
				if (exitStatus === 0) {
					result = "Done (no output)";
				} else {
					result = `Command failed with status ${exitStatus} (no output)`;
					// Specific pkexec/sudo failure message
					if (cmd.trim().startsWith("sudo ") && exitStatus !== 0) {
						result +=
							"\nNote: Authentication might have been dismissed or failed.";
					}
				}
			}

			label.set_text(result);
			copyBtn.show();

			// Remove the temporary box from the current message row before adding the permanent output message
			msgBox.remove_child(box);

			// Mark as executed in message metadata
			if (messageObj) {
				if (!messageObj.executed_commands) messageObj.executed_commands = [];
				if (!messageObj.executed_commands.includes(cmd)) {
					messageObj.executed_commands.push(cmd);
				}
			}

			const outputMsg = {
				role: "user",
				content: `COMMAND OUTPUT for "${cmd}" (exit status ${exitStatus}):\n${result}`,
			};
			this._history.push(outputMsg);
			History.saveHistory(this._history, this._settings.get_int("history-limit"));
			this._addMessageToUi(outputMsg.role, outputMsg.content, outputMsg);
			await this._getAiResponse();
		} catch (e) {
			cancelBtn.hide();
			if (e.message === "Command timed out") {
				msgBox.remove_child(box);
				const timeoutMsg = {
					role: "user",
					content: `COMMAND TIMEOUT for "${cmd}": Exceeded ${TIMEOUT_SECONDS} seconds`,
				};
				this._history.push(timeoutMsg);
				History.saveHistory(
					this._history,
					this._settings.get_int("history-limit"),
				);
				this._addMessageToUi(timeoutMsg.role, timeoutMsg.content, timeoutMsg);
			} else if (e.message === "Cancelled") {
				label.set_text("Command cancelled");
			} else {
				msgBox.remove_child(box);
				const errorMsg = {
					role: "user",
					content: `COMMAND ERROR for "${cmd}":\n${e.message}`,
				};
				this._history.push(errorMsg);
				History.saveHistory(
					this._history,
					this._settings.get_int("history-limit"),
				);
				this._addMessageToUi(errorMsg.role, errorMsg.content, errorMsg);
			}
			await this._getAiResponse();
		} finally {
			this._commandCancellable = null;
		}
	}

	_spawnCommandLineAsyncWithTimeout(cmd, timeoutSeconds) {
		return new Promise((resolve, reject) => {
			try {
				// Run via bash so shell operators (&&, |, >, ~, $VAR, globs) work.
				const [res, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
					null,
					["/bin/bash", "-c", cmd],
					null,
					GLib.SpawnFlags.SEARCH_PATH,
					null,
				);

				const os = new Gio.DataInputStream({
					base_stream: new Gio.UnixInputStream({fd: stdout, close_fd: true}),
				});
				const es = new Gio.DataInputStream({
					base_stream: new Gio.UnixInputStream({fd: stderr, close_fd: true}),
				});

				let timedOut = false;
				let completed = false;

				// Set up timeout
				const timeoutId = GLib.timeout_add_seconds(
					GLib.PRIORITY_DEFAULT,
					timeoutSeconds,
					() => {
						if (!completed) {
							timedOut = true;
							try {
								GLib.spawn_command_line_async(`kill ${pid}`);
							} catch (e) {
								// Ignore
							}
						}
						return false;
					},
				);

				let exitStatus = -1;
				// Add child watch to reap the process
				GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (pid, status) => {
					completed = true;
					exitStatus = (status >> 8) & 0xff;
					GLib.Source.remove(timeoutId);
				});

				const ob = [],
					eb = [];
				const read = (s, d) =>
					new Promise(r => {
						const f = () =>
							s.read_line_async(GLib.PRIORITY_LOW, null, (st, res) => {
								try {
									const [l] = st.read_line_finish(res);
									if (l !== null) {
										d.push(l);
										f();
									} else r();
								} catch (e) {
									r();
								}
							});
						f();
					});

				Promise.all([read(os, ob), read(es, eb)]).then(() => {
					if (timedOut) {
						reject(new Error("Command timed out"));
						return;
					}

					const merge = bufs => {
						const total = bufs.reduce((a, b) => a + b.length + 1, 0);
						const u = new Uint8Array(total);
						let p = 0;
						for (const b of bufs) {
							u.set(b, p);
							p += b.length;
							u[p++] = 10;
						}
						return GLib.Bytes.new(u);
					};
					resolve([true, merge(ob), merge(eb), exitStatus]);
				});
			} catch (e) {
				reject(e);
			}
		});
	}
}
