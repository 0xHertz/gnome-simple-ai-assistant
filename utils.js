export function formatMessage(text) {
	// Escape Pango special characters
	let escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

	// Markdown-like bold
	escaped = escaped.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");

	// Markdown-like italics
	escaped = escaped.replace(/\*(.*?)\*/g, "<i>$1</i>");
	escaped = escaped.replace(/_(.*?)_/g, "<i>$1</i>");

	// Code blocks (triple backticks)
	// We'll wrap them in a span with a specific font and background
	escaped = escaped.replace(
		/```([\s\S]*?)```/g,
		'<span font_family="monospace" background="#2b2b2b" foreground="#f8f8f2">\n$1\n</span>',
	);

	// Inline code
	escaped = escaped.replace(/`(.*?)`/g, "<tt>$1</tt>");

	// Command tags [RUN: command]
	escaped = escaped.replace(/\[RUN: (.*?)\]/g, "<b><u>Command: $1</u></b>");

	return escaped;
}
