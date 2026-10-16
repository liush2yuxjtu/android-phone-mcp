import { spawn } from "node:child_process";

export interface AdbResult {
  stdout: Buffer;
  stderr: string;
  code: number;
}

export interface RunAdbOptions {
  timeoutMs?: number;
  binary?: boolean;
}

export interface AdbExecutor {
  run(args: string[], options?: RunAdbOptions): Promise<AdbResult>;
}

export class AdbError extends Error {
  readonly args: string[];
  readonly stderr: string;
  readonly stdout: string;
  readonly code: number;

  constructor(message: string, args: string[], result: AdbResult) {
    super(message);
    this.name = "AdbError";
    this.args = args;
    this.stderr = result.stderr;
    this.stdout = decodePreview(result.stdout);
    this.code = result.code;
  }
}

function decodePreview(stdout: Buffer): string {
  return stdout.subarray(0, 4000).toString("utf8");
}

export function createRealAdbExecutor(adbPath = process.env.ADB_PATH ?? "adb"): AdbExecutor {
  return {
    async run(args, options = {}) {
      const timeoutMs = options.timeoutMs ?? 30_000;
      return await new Promise<AdbResult>((resolve, reject) => {
        const child = spawn(adbPath, args, {
          stdio: ["ignore", "pipe", "pipe"],
        });
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(
            new Error(
              `adb timed out after ${timeoutMs}ms: ${adbPath} ${args.join(" ")}`,
            ),
          );
        }, timeoutMs);

        child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
        child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
        child.on("error", (error) => {
          clearTimeout(timer);
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            reject(
              new Error(
                `adb executable not found (${adbPath}). Install Android platform-tools and ensure \`adb\` is on PATH, or set ADB_PATH.`,
              ),
            );
            return;
          }
          reject(error);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve({
            stdout: Buffer.concat(stdoutChunks),
            stderr: Buffer.concat(stderrChunks).toString("utf8"),
            code: code ?? 1,
          });
        });
      });
    },
  };
}

export function assertOk(result: AdbResult, args: string[], context: string): void {
  if (result.code === 0) {
    return;
  }
  const detail = result.stderr.trim() || decodePreview(result.stdout).trim() || `exit ${result.code}`;
  throw new AdbError(`${context}: ${detail}`, args, result);
}
