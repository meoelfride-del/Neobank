const { spawn, spawnSync } = require('child_process');
const net = require('net');
const path = require('path');

const nodeCommand = process.execPath;
const frontendDir = path.resolve(__dirname, '..');
const backendDir = path.resolve(frontendDir, 'backend');
const viteEntry = path.resolve(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js');
const forceMode = process.argv.includes('--force');
const managedPorts = [4000, 3001, 5173];

let backendProcess = null;
let frontendProcess = null;
let shuttingDown = false;

function canConnect(port, host) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(value);
    };

    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect({ port, host });
  });
}

function isPortOpen(port) {
  return Promise.all([
    canConnect(port, '127.0.0.1'),
    canConnect(port, '::1'),
  ]).then((results) => results.some(Boolean));
}

function getListeningPids(ports) {
  const result = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }

  const targetPorts = new Set(ports);
  const pids = new Set();
  const lines = (result.stdout || '').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('LISTENING')) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 5 || parts[0].toUpperCase() !== 'TCP') continue;

    const localPortMatch = parts[1].match(/:(\d+)$/);
    if (!localPortMatch) continue;

    const localPort = Number(localPortMatch[1]);
    const pid = Number(parts[4]);

    if (targetPorts.has(localPort) && Number.isFinite(pid)) {
      pids.add(pid);
    }
  }

  return [...pids];
}

function killPortOwners(ports) {
  const pids = getListeningPids(ports);

  if (!pids.length) {
    console.log(`[dev-all] aucun processus à tuer sur les ports ${ports.join(', ')}`);
    return;
  }

  for (const pid of pids) {
    console.log(`[dev-all] arrêt forcé du PID ${pid}`);
    const result = spawnSync('taskkill', ['/PID', String(pid), '/F', '/T'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });

    if (result.error) {
      console.error(`[dev-all] impossible d'arrêter le PID ${pid}`, result.error);
      continue;
    }

    if (result.status !== 0) {
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
      if (output) {
        console.error(`[dev-all] taskkill PID ${pid} a retourné ${result.status}: ${output}`);
      }
    }
  }
}

async function waitForPortsClosed(ports, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const states = await Promise.all(ports.map(isPortOpen));
    if (states.every((state) => !state)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function killChild(child) {
  if (!child || child.killed) return;

  try {
    child.kill('SIGINT');
  } catch {
    // ignore
  }

  setTimeout(() => {
    if (child && !child.killed) {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }
  }, 3000);
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  killChild(backendProcess);
  killChild(frontendProcess);

  setTimeout(() => process.exit(exitCode), 250);
}

function monitorProcess(label, child) {
  child.on('error', (err) => {
    console.error(`[${label}] impossible de démarrer`, err);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const exitCode = code ?? (signal ? 1 : 0);
    console.error(`[${label}] terminé (${code ?? 'null'}${signal ? `, signal ${signal}` : ''})`);
    shutdown(exitCode);
  });
}

function startBackend() {
  const child = spawn(nodeCommand, ['server.js'], {
    cwd: backendDir,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });
  monitorProcess('backend', child);
  return child;
}

function startFrontend() {
  const child = spawn(nodeCommand, [viteEntry], {
    cwd: frontendDir,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });
  monitorProcess('frontend', child);
  return child;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

(async () => {
  if (forceMode) {
    console.log('[dev-all] mode force activé');
    killPortOwners(managedPorts);
    await waitForPortsClosed(managedPorts);
  }

  const backendRunning = await isPortOpen(4000);
  const frontendRunning = await isPortOpen(5173);

  console.log(
    `[dev-all] état détecté -> backend: ${backendRunning ? 'déjà actif' : 'arrêté'}, frontend: ${frontendRunning ? 'déjà actif' : 'arrêté'}`
  );

  if (!backendRunning || forceMode) {
    const backendEnv = { ...process.env };
    require(path.join(backendDir, 'node_modules', 'dotenv')).config({
      path: path.join(backendDir, '.env'),
      processEnv: backendEnv,
    });
    const missing = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY']
      .filter((name) => !backendEnv[name]?.trim());
    if (missing.length) {
      console.error(`[dev-all] API non démarrée : configuration manquante (${missing.join(', ')}).`);
      console.error('[dev-all] Configurez backend/.env avec votre base PostgreSQL locale et vos clés, puis relancez npm run dev:all.');
      console.error('[dev-all] Le frontend seul ne permet pas de créer un compte. Voir REGISTRATION_INCIDENT.md.');
      process.exitCode = 1;
      return;
    }
    const localData = path.join(backendDir, '.local-postgres', 'data');
    const databaseUrl = new URL(backendEnv.DATABASE_URL);
    if (databaseUrl.hostname === '127.0.0.1' && databaseUrl.port === '5433'
      && require('node:fs').existsSync(path.join(localData, 'PG_VERSION'))) {
      const pgCtl = path.join(process.env.NEOBANK_PG_BIN || 'C:/Program Files/PostgreSQL/18/bin', 'pg_ctl.exe');
      const options = { windowsHide: true, stdio: 'ignore' };
      const status = spawnSync(pgCtl, ['-D', localData, 'status'], options);
      if (status.status !== 0) {
        const started = spawnSync(pgCtl, ['-D', localData, '-l', path.join(backendDir, '.local-postgres', 'postgres.log'), '-w', 'start'], options);
        if (started.error || started.status !== 0) throw new Error('Démarrage PostgreSQL local impossible. Consultez backend/.local-postgres/postgres.log.');
        console.log('[dev-all] PostgreSQL local démarré sur le port 5433.');
      }
    }
    backendProcess = startBackend();
  }

  if (!frontendRunning || forceMode) {
    frontendProcess = startFrontend();
  }

  if (backendRunning && frontendRunning) {
    console.log('[dev-all] rien à lancer, les deux services tournent déjà.');
  }
})().catch((err) => {
  console.error('[dev-all] erreur de démarrage', err);
  shutdown(1);
});
