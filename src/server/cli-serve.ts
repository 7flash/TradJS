export interface ServeCliOptions {
  appDir?: string;
  unix?: string;
  port?: number;
  handleSignals: true;
}

function takeValue(
  args: readonly string[],
  flag: string,
  index: number,
): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

export function parseServeArgs(args: readonly string[]): ServeCliOptions {
  const options: ServeCliOptions = { handleSignals: true };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--appdir") {
      options.appDir = takeValue(args, arg, i++);
      continue;
    }

    if (arg === "--unix") {
      if (options.port !== undefined) {
        throw new Error("Cannot combine a TCP port with --unix");
      }
      options.unix = takeValue(args, arg, i++);
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown serve option: ${arg}`);
    }

    if (/^\d+$/.test(arg)) {
      if (options.unix !== undefined || options.port !== undefined) {
        throw new Error(`Unexpected serve argument: ${arg}`);
      }
      const port = Number(arg);
      if (!Number.isInteger(port) || port < 0 || port > 65_535) {
        throw new Error(`Invalid port: ${arg}`);
      }
      options.port = port;
      continue;
    }

    if (options.port !== undefined || options.unix !== undefined) {
      throw new Error(`Unexpected serve argument: ${arg}`);
    }
    options.unix = arg;
  }

  return options;
}
