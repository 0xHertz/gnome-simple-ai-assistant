import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Soup from "gi://Soup?version=3.0";

export class ApiClient {
	constructor() {
		this._session = new Soup.Session();
		this._session.timeout = 60; // 60 second timeout
	}

	/**
	 * Send a message to the AI provider
	 * @param {string} provider - 'openai', 'gemini', 'claude', 'deepseek', or 'custom'
	 * @param {string} apiKey - API key for the provider
	 * @param {string} model - Model name to use
	 * @param {array} messages - Chat messages array
	 * @param {Gio.Cancellable} cancellable - Optional cancellable for timeout
	 * @param {string} baseUrl - Base URL for the 'custom' OpenAI-compatible provider
	 * @returns {Promise<string>} - AI response text
	 */
	async sendMessage(provider, apiKey, model, messages, cancellable = null, baseUrl = null) {
		if (!apiKey) {
			throw new Error("API Key is missing");
		}

		if (provider === "openai") {
			return this._sendOpenAI(apiKey, model, messages, cancellable);
		} else if (provider === "deepseek") {
			return this._sendOpenAI(apiKey, model, messages, cancellable, {
				baseUrl: "https://api.deepseek.com/v1",
				defaultModel: "deepseek-chat",
				label: "DeepSeek",
			});
		} else if (provider === "custom") {
			return this._sendOpenAI(apiKey, model, messages, cancellable, {
				baseUrl: baseUrl,
				defaultModel: "",
				label: "Custom",
			});
		} else if (provider === "gemini") {
			return this._sendGemini(apiKey, model, messages, cancellable);
		} else if (provider === "claude") {
			return this._sendClaude(apiKey, model, messages, cancellable);
		} else {
			throw new Error("Invalid provider");
		}
	}

	async _sendOpenAI(apiKey, model, messages, cancellable, options = {}) {
		const baseUrl = options.baseUrl || "https://api.openai.com/v1";
		const defaultModel = options.defaultModel || "gpt-4o-mini";
		const label = options.label || "OpenAI";

		const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
		const body = JSON.stringify({
			model: model || defaultModel,
			messages: messages,
		});

		const message = Soup.Message.new("POST", url);
		message.request_headers.append("Authorization", `Bearer ${apiKey}`);
		message.request_headers.append("Content-Type", "application/json");

		const encoder = new TextEncoder();
		const bytes = GLib.Bytes.new(encoder.encode(body));
		message.set_request_body_from_bytes("application/json", bytes);

		const responseBytes = await this._session.send_and_read_async(
			message,
			GLib.PRIORITY_DEFAULT,
			cancellable,
		);

		const decoder = new TextDecoder("utf-8");
		const responseText = decoder.decode(responseBytes.get_data());

		if (message.status_code !== 200) {
			throw new Error(`${label} Error: ${message.status_code} - ${responseText}`);
		}

		try {
			const json = JSON.parse(responseText);
			if (!json?.choices?.[0]?.message?.content) {
				throw new Error("Invalid response structure");
			}
			return json.choices[0].message.content;
		} catch (e) {
			throw new Error(`Failed to parse ${label} response: ${e.message}`);
		}
	}

	async _sendGemini(apiKey, model, messages, cancellable) {
		// Use header-based authentication instead of URL query parameter
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.5-flash"}:generateContent`;

		const systemMessage = messages.find(m => m.role === "system");
		const chatMessages = messages.filter(m => m.role !== "system");

		const body = {
			contents: chatMessages.map(m => ({
				role: m.role === "assistant" ? "model" : "user",
				parts: [{text: m.content}],
			})),
		};

		if (systemMessage) {
			body.system_instruction = {
				parts: [{text: systemMessage.content}],
			};
		}

		const message = Soup.Message.new("POST", url);
		message.request_headers.append("x-goog-api-key", apiKey);
		message.request_headers.append("Content-Type", "application/json");

		const encoder = new TextEncoder();
		const bytes = GLib.Bytes.new(encoder.encode(JSON.stringify(body)));
		message.set_request_body_from_bytes("application/json", bytes);

		const responseBytes = await this._session.send_and_read_async(
			message,
			GLib.PRIORITY_DEFAULT,
			cancellable,
		);
		const decoder = new TextDecoder("utf-8");
		const responseText = decoder.decode(responseBytes.get_data());

		if (message.status_code !== 200) {
			throw new Error(`Gemini Error: ${message.status_code} - ${responseText}`);
		}

		try {
			const json = JSON.parse(responseText);
			if (
				json.candidates &&
				json.candidates[0].content &&
				json.candidates[0].content.parts[0]
			) {
				return json.candidates[0].content.parts[0].text;
			} else {
				throw new Error("Unexpected Gemini response format");
			}
		} catch (e) {
			throw new Error(`Failed to parse Gemini response: ${e.message}`);
		}
	}

	async _sendClaude(apiKey, model, messages, cancellable) {
		const url = "https://api.anthropic.com/v1/messages";

		// Separate system message from chat messages
		const systemMessage = messages.find(m => m.role === "system");
		const chatMessages = messages.filter(m => m.role !== "system");

		const body = {
			model: model || "claude-sonnet-4-20250514",
			max_tokens: 4096,
			messages: chatMessages.map(m => ({
				role: m.role, // 'user' or 'assistant'
				content: m.content,
			})),
		};

		if (systemMessage) {
			body.system = systemMessage.content;
		}

		const message = Soup.Message.new("POST", url);
		message.request_headers.append("x-api-key", apiKey);
		message.request_headers.append("anthropic-version", "2023-06-01");
		message.request_headers.append("Content-Type", "application/json");

		const encoder = new TextEncoder();
		const bytes = GLib.Bytes.new(encoder.encode(JSON.stringify(body)));
		message.set_request_body_from_bytes("application/json", bytes);

		const responseBytes = await this._session.send_and_read_async(
			message,
			GLib.PRIORITY_DEFAULT,
			cancellable,
		);

		const decoder = new TextDecoder("utf-8");
		const responseText = decoder.decode(responseBytes.get_data());

		if (message.status_code !== 200) {
			throw new Error(`Claude Error: ${message.status_code} - ${responseText}`);
		}

		try {
			const json = JSON.parse(responseText);
			if (json.content && json.content[0] && json.content[0].text) {
				return json.content[0].text;
			} else {
				throw new Error("Unexpected Claude response format");
			}
		} catch (e) {
			throw new Error(`Failed to parse Claude response: ${e.message}`);
		}
	}
}
