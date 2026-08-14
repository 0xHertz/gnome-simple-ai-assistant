# Simple AI Assistant

A light-weight, private agentic AI assistant for GNOME Shell. Get things done with terminal command support and local system context.

**Source Code**: [GitHub](https://github.com/MomenAbdelwadoud/linux-simple-ai-assistant)

## 🌟 Features

- **Agentic Loop**: AI can propose commands, see output, and continue the task.
- **Secure & Private**: API keys are stored locally in GSettings. No data is sent to anyone but your chosen AI provider.
- **Sudo Support**: Execute privileged commands safely via `pkexec` with native system password prompts and output capture.
- **System Awareness**: Optionally share system details (CPU, GPU, RAM, OS) for better technical assistance.
- **Theme Support**: Automatically matches your system theme (Light/Dark).
- **History Management**: Local history storage with configurable message limits.

## 📸 Screenshots

![New Chat](demo/screenshot-new-chat.png)
_New Chat interface with AI provider selection_

![Command Execution](demo/screenshot-running.png)
_Agentic command execution with terminal output_

## 🛠 Prerequisites

- GNOME Shell 45+
- API Key for OpenAI, Google Gemini, Anthropic Claude, DeepSeek, or any OpenAI-compatible endpoint

## 🚀 Installation

1. Clone or download this repository.
2. Copy the folder to your local extensions directory:
    ```bash
    cp -r . ~/.local/share/gnome-shell/extensions/simple-ai-assistant@momen.codes
    ```
3. Compile the settings schema:
    ```bash
    glib-compile-schemas ~/.local/share/gnome-shell/extensions/simple-ai-assistant@momen.codes/schemas/
    ```
4. Restart GNOME Shell (Alt+F2 + `r` on X11, or Log out/Log in on Wayland).
5. Enable the extension using GNOME Extensions app.

## 📝 Privacy Notes

- **API Keys**: Stored locally in your system's GSettings (dconf).
- **Sudo Commands**: Privileged commands use `pkexec`, ensuring the extension never sees your password while still capturing command output correctly.
- **Data**: All data stays on your machine. Chat history is stored locally in `~/.cache/simple-ai-assistant/`.
- **Telemetry**: No tracking or analytics code is included.

## 👨‍💻 Credits

Developed by **Momen Elkhalifa** ([momen.codes](https://momen.codes)).

## 📜 License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
