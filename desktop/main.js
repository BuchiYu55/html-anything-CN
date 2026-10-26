/**
 * html-anything desktop shell (Electron sidecar, issue #156 community approach).
 *
 * The Next standalone server bundle ships inside the app resources; the
 * Electron binary doubles as the Node runtime via ELECTRON_RUN_AS_NODE, so
 * users need no Node.js installed. On launch: pick a free port, spawn the
 * server, wait for readiness, open the window.
 */
const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const net = require("net");
const path = require("path");

let serverProc = null;
let mainWindow = null;

function findFreePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

function serverRoot() {
  // Packaged: extraResources copies <repo>/next/.next/standalone → resources/server,
  // whose working dir (server.js + package.json) lives under server/next (pnpm
  // workspace layout). Dev: run from the checkout.
  if (app.isPackaged) return path.join(process.resourcesPath, "server", "next");
  return path.join(__dirname, "..", "next", ".next", "standalone", "next");
}

/**
 * Discover the ZCode desktop install root and export
 * ZCODE_WINDOWS_APP_INSTALL_DIR so the server's detector can find
 * zcode.cjs even when the app wasn't launched from a ZCode-hosted
 * terminal (the env var is otherwise only set there). Reads the
 * uninstall registry entry's DisplayIcon, which points inside the
 * install root (e.g. D:\ZCode\uninstallerIcon.ico).
 */
function discoverZcodeInstallDir() {
  if (process.platform !== "win32") return;
  try {
    const { execSync } = require("child_process");
    const out = execSync(
      `reg query HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall /s /f "ZCode" /d`,
      { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] },
    );
    const iconLine = out.split(/\r?\n/).find((l) => /DisplayIcon\s+REG_SZ/i.test(l));
    const iconPath = iconLine && iconLine.split("REG_SZ")[1]?.trim();
    if (iconPath) {
      // "<root>\uninstallerIcon.ico" (or "<root>\something.exe") → root
      const root = path.dirname(iconPath);
      if (root && root !== path.parse(root).root) {
        process.env.ZCODE_WINDOWS_APP_INSTALL_DIR =
          process.env.ZCODE_WINDOWS_APP_INSTALL_DIR || root;
      }
    }
  } catch {
    // No ZCode registry entry — fine, the agent just won't be offered.
  }
}

function startServer(port) {
  const root = serverRoot();
  serverProc = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  serverProc.stdout.on("data", (d) => console.log(`[server] ${String(d).trim()}`));
  serverProc.stderr.on("data", (d) => console.error(`[server] ${String(d).trim()}`));
  serverProc.on("exit", (code) => console.error(`[server] exited code=${code}`));
}

function waitReady(port, timeoutMs = 30000) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 2000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - t0 > timeoutMs) reject(new Error("server did not become ready"));
        else setTimeout(poll, 300);
      });
    };
    poll();
  });
}

function killServer() {
  if (serverProc && !serverProc.killed) {
    try {
      serverProc.kill();
    } catch {}
  }
}

app.whenReady().then(async () => {
  discoverZcodeInstallDir();
  const port = await findFreePort();
  startServer(port);
  await waitReady(port);
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    autoHideMenuBar: true,
    backgroundColor: "#faf8f4",
  });
  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
  // External links (docs, GitHub) open in the system browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
});

app.on("window-all-closed", () => {
  killServer();
  app.quit();
});
app.on("quit", killServer);
