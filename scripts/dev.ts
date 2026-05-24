const commands = [
  ["bun", "run", "--filter", "@nas-tools/server", "start"],
  ["bun", "run", "--filter", "@nas-tools/web", "dev"],
] as const;

const children = commands.map((cmd) =>
  Bun.spawn(cmd, {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: {
      ...process.env,
      HOST: process.env.HOST ?? "0.0.0.0",
      PORT: process.env.PORT ?? "8788",
    },
  }),
);

const shutdown = () => {
  for (const child of children) child.kill();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.race(children.map((child) => child.exited));
shutdown();
