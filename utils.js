function escapePango(text) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

// Split raw markdown into blocks: text, fenced code and tables.
export function parseBlocks(text) {
	if (!text) return [];
	const lines = text.split("\n");
	const blocks = [];
	let textBuf = [];
	let i = 0;

	const flushText = () => {
		const content = textBuf.join("\n").trim();
		textBuf = [];
		if (content) {
			blocks.push({ type: "text", content });
		}
	};

	while (i < lines.length) {
		const line = lines[i];

		// Fenced code block
		if (line.trimStart().startsWith("```")) {
			flushText();
			const code = [];
			i++;
			while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
				code.push(lines[i]);
				i++;
			}
			i++; // skip closing fence
			blocks.push({ type: "code", content: code.join("\n") });
			continue;
		}

		// Table: a row with pipes followed by a separator row (---)
		if (
			line.includes("|") &&
			i + 1 < lines.length &&
			lines[i + 1].includes("-") &&
			/^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])
		) {
			flushText();
			const table = [line, lines[i + 1]];
			i += 2;
			while (i < lines.length && lines[i].includes("|")) {
				table.push(lines[i]);
				i++;
			}
			blocks.push({ type: "table", content: table.join("\n") });
			continue;
		}

		textBuf.push(line);
		i++;
	}

	flushText();
	return blocks;
}

// Render a markdown table as aligned monospace Pango markup.
export function formatTable(text) {
	const rows = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (/^\|?[\s:|-]+\|?$/.test(trimmed) && trimmed.includes("-")) continue;
		const cells = trimmed
			.replace(/^\|/, "")
			.replace(/\|$/, "")
			.split("|")
			.map(c => c.trim());
		rows.push(cells);
	}
	if (!rows.length) return escapePango(text);

	const colCount = Math.max(...rows.map(r => r.length));
	const widths = new Array(colCount).fill(0);
	for (const row of rows) {
		for (let c = 0; c < row.length; c++) {
			widths[c] = Math.max(widths[c], row[c].length);
		}
	}
	const fmtRow = row => {
		const cells = [];
		for (let c = 0; c < colCount; c++) {
			cells.push((row[c] ?? "").padEnd(widths[c]));
		}
		return cells.join("  ").trimEnd();
	};

	const sep = widths.map(w => "─".repeat(w)).join("──");

	const out = [];
	for (let r = 0; r < rows.length; r++) {
		const rowText = escapePango(fmtRow(rows[r]));
		out.push(r === 0 ? `<b>${rowText}</b>` : rowText);
		if (r === 0) out.push(`<span foreground="#9a9a9a">${sep}</span>`);
	}
	return out.join("\n");
}

export function formatMessage(text) {
	if (!text) return text;

	// Stash inline code and [RUN:] tags so their contents are never mangled.
	const stash = [];
	const stashCode = rendered => {
		stash.push(rendered);
		return `\u0001${stash.length - 1}\u0001`;
	};

	// Inline code (`...`)
	text = text.replace(/`([^`\n]+)`/g, (m, code) =>
		stashCode(`<tt>${escapePango(code)}</tt>`),
	);

	// Command tags [RUN: command]
	text = text.replace(/\[RUN: (.*?)\]/g, (m, cmd) =>
		stashCode(`<b><u>Command: ${escapePango(cmd)}</u></b>`),
	);

	text = escapePango(text);

	// Headers
	text = text.replace(/^######\s+(.+)$/gm, "<b>$1</b>");
	text = text.replace(/^#####\s+(.+)$/gm, "<b>$1</b>");
	text = text.replace(/^####\s+(.+)$/gm, "<b>$1</b>");
	text = text.replace(/^###\s+(.+)$/gm, '<b><span size="large">$1</span></b>');
	text = text.replace(/^##\s+(.+)$/gm, '<b><span size="large">$1</span></b>');
	text = text.replace(/^#\s+(.+)$/gm, '<b><span size="x-large">$1</span></b>');

	// Blockquote
	text = text.replace(/^&gt;\s?(.*)$/gm, '<span foreground="#9a9a9a">│ $1</span>');

	// Horizontal rule
	text = text.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "──────────");

	// Unordered list
	text = text.replace(/^(\s*)[-*+]\s+(.*)$/gm, "$1• $2");

	// Bold
	text = text.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
	text = text.replace(/__([^_]+)__/g, "<b>$1</b>");

	// Strikethrough
	text = text.replace(/~~([^~]+)~~/g, "<s>$1</s>");

	// Italic
	text = text.replace(/\*([^*\n]+)\*/g, "<i>$1</i>");
	text = text.replace(/(^|[^_A-Za-z0-9])_([^_\n]+)_(?!_)/g, "$1<i>$2</i>");

	// Links
	text = text.replace(
		/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
		'<span underline="single" foreground="#4a9eff">$1</span>',
	);

	text = text.replace(/\u0001(\d+)\u0001/g, (m, idx) => stash[Number(idx)]);

	return text;
}
