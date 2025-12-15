import { join } from 'path';
import dotenv from 'dotenv';
import net from 'node:net';

type SpawnOpts = {
  cwd: string;
  env?: Record<string, string | undefined>;
};

function loadEnv() {
  dotenv.config({ path: join(process.cwd(), '.env') });
}

function numEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : fallback;
}

function spawnLogged(name: string, cmd: string[], opts: SpawnOpts) {
  const proc = Bun.spawn({
    cmd,
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'inherit',
  });

  const prefix = `[${name}]`;
  const pipe = async (
    stream: ReadableStream<Uint8Array> | null | undefined,
    write: (s: string) => void
  ) => {
    if (!stream) return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split(/\r?\n/);
      buf = parts.pop() ?? '';
      for (const line of parts) write(line.length ? `${prefix} ${line}\n` : '\n');
    }
    if (buf.length) write(`${prefix} ${buf}\n`);
  };

  pipe(proc.stdout, (s) => process.stdout.write(s)).catch(() => {});
  pipe(proc.stderr, (s) => process.stderr.write(s)).catch(() => {});

  return proc;
}

function registerShutdown(children: Array<{ proc: any }>) {
  let signaled = false;
  const shutdown = () => {
    for (const c of children) {
      try {
        c.proc.kill();
      } catch {}
    }
  };
  const handle = () => {
    if (signaled) return;
    signaled = true;
    shutdown();
    setTimeout(() => process.exit(0), 50);
  };
  process.on('SIGINT', handle);
  process.on('SIGTERM', handle);
}

async function isPortListening(host: string, port: number, timeoutMs = 300): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = net.connect({ host, port });

    const finish = (result: boolean) => {
      try {
        socket.destroy();
      } catch {}
      resolve(result);
    };

    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', (err: any) => {
      const code = err?.code as string | undefined;
      if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EHOSTUNREACH') return finish(false);
      return finish(false);
    });

    socket.setTimeout(timeoutMs);
  });
}

async function dev() {
  const root = process.cwd();

  const host = process.env.HOST ?? '127.0.0.1';
  const forceSpawn = process.env.DEV_FORCE_SPAWN === '1' || process.env.DEV_FORCE_SPAWN === 'true';

  const apiPort = numEnv('API_PORT', 3699);
  const publicPort = numEnv('PUBLIC_PORT', 3700);
  const coachPort = numEnv('COACH_PORT', 3701);
  const clientPort = numEnv('CLIENT_PORT', 3702);
  const adminPort = numEnv('ADMIN_PORT', 3703);

  // Check if LiveKit is configured
  const hasLiveKit = Boolean(
    process.env.LIVEKIT_URL &&
    process.env.LIVEKIT_API_KEY &&
    process.env.LIVEKIT_API_SECRET &&
    process.env.DEEPGRAM_API_KEY
  );

  const children: Array<{ proc: any }> = [];

  // API Server
  if (!forceSpawn && (await isPortListening(host, apiPort))) {
    console.log(`[dev] api already listening on ${host}:${apiPort}, skipping spawn (set DEV_FORCE_SPAWN=1 to override)`);
  } else {
    children.push({
      proc: spawnLogged('api', ['bun', 'run', 'dev'], {
        cwd: join(root, 'apps', 'api'),
        env: { API_PORT: String(apiPort) },
      }),
    });
  }

  // Web Public
  if (!forceSpawn && (await isPortListening(host, publicPort))) {
    console.log(
      `[dev] web-public already listening on ${host}:${publicPort}, skipping spawn (set DEV_FORCE_SPAWN=1 to override)`
    );
  } else {
    children.push({
      proc: spawnLogged('web-public', ['bun', 'run', 'dev', '--', '--port', String(publicPort)], {
        cwd: join(root, 'apps', 'web-public'),
        env: { API_PORT: String(apiPort), PUBLIC_PORT: String(publicPort) },
      }),
    });
  }

  // Web Coach
  if (!forceSpawn && (await isPortListening(host, coachPort))) {
    console.log(`[dev] web-coach already listening on ${host}:${coachPort}, skipping spawn (set DEV_FORCE_SPAWN=1 to override)`);
  } else {
    children.push({
      proc: spawnLogged('web-coach', ['bun', 'run', 'dev', '--', '--port', String(coachPort)], {
        cwd: join(root, 'apps', 'web-coach'),
        env: { API_PORT: String(apiPort), COACH_PORT: String(coachPort) },
      }),
    });
  }

  // Web Client
  if (!forceSpawn && (await isPortListening(host, clientPort))) {
    console.log(`[dev] web-client already listening on ${host}:${clientPort}, skipping spawn (set DEV_FORCE_SPAWN=1 to override)`);
  } else {
    children.push({
      proc: spawnLogged('web-client', ['bun', 'run', 'dev', '--', '--port', String(clientPort)], {
        cwd: join(root, 'apps', 'web-client'),
        env: { API_PORT: String(apiPort), CLIENT_PORT: String(clientPort) },
      }),
    });
  }

  // Web Admin
  if (!forceSpawn && (await isPortListening(host, adminPort))) {
    console.log(`[dev] web-admin already listening on ${host}:${adminPort}, skipping spawn (set DEV_FORCE_SPAWN=1 to override)`);
  } else {
    children.push({
      proc: spawnLogged('web-admin', ['bun', 'run', 'dev', '--', '--port', String(adminPort)], {
        cwd: join(root, 'apps', 'web-admin'),
        env: { API_PORT: String(apiPort), ADMIN_PORT: String(adminPort) },
      }),
    });
  }

  // AI Agent status message
  if (hasLiveKit) {
    console.log('[dev] ✅ LiveKit + Deepgram configured');
    console.log('[dev]    AI Agent will auto-spawn when a client joins a room');
  } else {
    console.log('[dev] ⚠️  AI Agent disabled - missing environment variables:');
    if (!process.env.LIVEKIT_URL) console.log('[dev]    - LIVEKIT_URL');
    if (!process.env.LIVEKIT_API_KEY) console.log('[dev]    - LIVEKIT_API_KEY');
    if (!process.env.LIVEKIT_API_SECRET) console.log('[dev]    - LIVEKIT_API_SECRET');
    if (!process.env.DEEPGRAM_API_KEY) console.log('[dev]    - DEEPGRAM_API_KEY');
  }

  if (children.length === 0) {
    console.log('[dev] All target ports are already in use; nothing to spawn.');
    return;
  }

  console.log('[dev] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[dev] 🚀 Development servers starting...');
  console.log('[dev]    API:         http://localhost:' + apiPort);
  console.log('[dev]    Public:      http://localhost:' + publicPort);
  console.log('[dev]    Coach:       http://localhost:' + coachPort);
  console.log('[dev]    Client:      http://localhost:' + clientPort);
  console.log('[dev]    Admin:       http://localhost:' + adminPort);
  console.log('[dev] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  registerShutdown(children);

  const code = await Promise.race(children.map((c) => c.proc.exited));
  process.exit(code);
}

async function start() {
  const apiDir = join(process.cwd(), 'apps', 'api');
  const proc = Bun.spawn({
    cmd: ['bun', 'run', 'start'],
    cwd: apiDir,
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  });
  process.exit(await proc.exited);
}

async function main() {
  loadEnv();
  const mode = (process.argv[2] ?? 'dev').toLowerCase();
  if (mode === 'dev') return dev();
  if (mode === 'start') return start();
  console.log('Usage: bun run dev | bun run start');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
