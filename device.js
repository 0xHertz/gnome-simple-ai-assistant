import GLib from "gi://GLib";

export function getDeviceInfo() {
	let info = "";
	try {
		// Distro info
		const [ok, osRelease] = GLib.file_get_contents("/etc/os-release");
		if (ok) {
			const lines = new TextDecoder().decode(osRelease).split("\n");
			const nameLine = lines.find(l => l.startsWith("PRETTY_NAME="));
			if (nameLine) info += `Distro: ${nameLine.split("=")[1].replace(/"/g, "")}\n`;
		}

		// Kernel
		const [res, stdout, stderr, status] = GLib.spawn_command_line_sync("uname -srvm");
		if (res) info += `Kernel: ${new TextDecoder().decode(stdout).trim()}\n`;

		// Memory
		const [memRes, memStdout] = GLib.spawn_command_line_sync("free -h");
		if (memRes) {
			const lines = new TextDecoder().decode(memStdout).split("\n");
			const memLine = lines.find(l => l.startsWith("Mem:"));
			if (memLine) info += `Memory: ${memLine.trim()}\n`;
		}

		// CPU (Basic)
		const [cpuRes, cpuStdout] = GLib.spawn_command_line_sync(
			'grep "model name" /proc/cpuinfo',
		);
		if (cpuRes) {
			const line = new TextDecoder().decode(cpuStdout).split("\n")[0];
			if (line) info += `CPU: ${line.split(":")[1].trim()}\n`;
		}
	} catch (e) {
		info += "Error gathering device info: " + e.message;
	}
	return info || "Unknown device info";
}
