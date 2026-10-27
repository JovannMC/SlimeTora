// Console only for now. The Tauri file log plugin has no Electron equivalent wired yet.

export function info(...args: any[]) {
	console.log(...args);
}

export function warn(...args: any[]) {
	console.warn(...args);
}

export function debug(...args: any[]) {
	console.debug(...args);
}

export function trace(...args: any[]) {
	console.trace(...args);
}

export function error(...args: any[]) {
	console.error(...args);
}
