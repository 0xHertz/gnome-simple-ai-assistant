import GLib from "gi://GLib";
import Gio from "gi://Gio";

export function saveHistory(history, limit) {
	try {
		let truncatedHistory = history;
		const hasSystemPrompt = history.length > 0 && history[0].role === "system";
		const systemPrompt = hasSystemPrompt ? history[0] : null;

		const chatMessages = hasSystemPrompt ? history.slice(1) : history;

		if (chatMessages.length > limit) {
			const recentMessages = chatMessages.slice(-limit);
			truncatedHistory = systemPrompt
				? [systemPrompt, ...recentMessages]
				: recentMessages;
		}

		const dir = GLib.get_user_cache_dir() + "/simple-ai-assistant";
		GLib.mkdir_with_parents(dir, 0o755);
		const path = dir + "/history.json";
		const file = Gio.File.new_for_path(path);
		const contents = JSON.stringify(truncatedHistory);

		file.replace_contents(
			contents,
			null,
			false,
			Gio.FileCreateFlags.REPLACE_DESTINATION,
			null,
		);
	} catch (e) {
		console.error(`Simple AI Assistant: Failed to save history: ${e.message}`);
	}
}

export function loadHistory() {
	const path = GLib.get_user_cache_dir() + "/simple-ai-assistant/history.json";
	const file = Gio.File.new_for_path(path);
	try {
		if (!file.query_exists(null)) return [];
		const [success, contents] = file.load_contents(null);
		if (success) {
			const decoder = new TextDecoder("utf-8");
			const decoded = decoder.decode(contents);
			return JSON.parse(decoded) || [];
		}
	} catch (e) {
		console.error(`Simple AI Assistant: Failed to load history: ${e.message}`);
	}
	return [];
}

export function clearHistory() {
	const path = GLib.get_user_cache_dir() + "/simple-ai-assistant/history.json";
	const file = Gio.File.new_for_path(path);
	try {
		if (file.query_exists(null)) {
			file.delete(null);
		}
	} catch (e) {
		console.error(`Simple AI Assistant: Failed to clear history: ${e.message}`);
	}
}
