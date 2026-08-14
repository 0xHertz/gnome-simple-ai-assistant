# Testing Simple AI Assistant

To test your extension without restarting your main desktop session, you can use a **Nested GNOME Shell**.

## Prerequisites

- `gnome-shell` installed.
- `dbus-run-session` (usually part of `dbus-x11` or similar).

## Steps

1. **Install the extension locally**:

    ```bash
    mkdir -p ~/.local/share/gnome-shell/extensions/simple-ai-assistant@momen.codes
    cp -r * ~/.local/share/gnome-shell/extensions/simple-ai-assistant@momen.codes/
    glib-compile-schemas ~/.local/share/gnome-shell/extensions/simple-ai-assistant@momen.codes/schemas/
    ```

2. **Run Nested Shell**:
   Open a terminal and run:

    ```bash
    MUTTER_DEBUG_DUMMY_MODE_SPECS=2560x1440 dbus-run-session gnome-shell --nested --wayland
    ```

    A new window will open with a fresh GNOME session.

3. **Enable the extension in the nested shell**:
   In the nested shell window (or via a terminal if you can target the nested session's bus, but easier to just use the Extensions app inside if available), enable it:

    ```bash
    gnome-extensions enable simple-ai-assistant@momen.codes
    ```

4. **Debugging**:
   Check the logs for errors:
    ```bash
    journalctl -f -o cat /usr/bin/gnome-shell
    ```
    Or look at the terminal where you ran the nested shell.

## Security Notes

- **Command Execution**: The extension uses `GLib.spawn_async_with_pipes` to run commands. It only runs commands when the **user explicitly clicks the "Run Command" button**.
    - **Sudo Support**: Commands starting with `sudo` are automatically wrapped in `pkexec`. This triggers a native GNOME password dialog, ensuring your password stays within the system's secure layers while allowing the extension to capture the command output.
- **API Keys**: Keys are stored locally in your system's GSettings (dconf) and are protected by standard Linux file permissions within your home directory.
- **History**: History is stored in `~/.cache/simple-ai-assistant/history.json`. It is truncated to the limit set in preferences (default 20) to prevent large files.
