/** Cross-platform "open this URL in the default browser". */

import { spawn } from "node:child_process";

export function openUrl(url: string): boolean {
  try {
    let command: string;
    let args: string[];
    switch (process.platform) {
      case "darwin":
        command = "open";
        args = [url];
        break;
      case "win32":
        command = "cmd";
        args = ["/c", "start", "", url];
        break;
      default:
        command = "xdg-open";
        args = [url];
    }
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** Render a clickable terminal hyperlink (OSC 8) with plain-text fallback. */
export function terminalLink(url: string, label = url): string {
  // ESC ]8;;URL ESC \ label ESC ]8;; ESC \
  const esc = "\u001B";
  return `${esc}]8;;${url}${esc}\\${label}${esc}]8;;${esc}\\`;
}
