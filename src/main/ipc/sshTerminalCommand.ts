export function buildSshTerminalCommand(username: string, host: string, port: number, remotePath?: string): string {
  const base = `ssh -p ${port} ${username}@${host}`;
  if (!remotePath) return base;
  const remoteCommand = `cd -- ${shellSingleQuote(remotePath)} && exec "\${SHELL:-/bin/bash}" -i`;
  return `${base} -t ${shellSingleQuote(remoteCommand)}`;
}

export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
