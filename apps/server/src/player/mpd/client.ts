import net from "node:net";
import { ResultAsync } from "@onrails/result";

export type MpdClientError = { message: string };

/** Injectable interface — swap real TCP impl for a mock in tests. */
export type MpdClient = {
  cmd: (command: string) => ResultAsync<string[], MpdClientError>;
  close: () => void;
};

type PendingCommand = {
  resolve: (lines: string[]) => void;
  reject: (e: MpdClientError) => void;
};

/** Open a single MPD TCP connection. Returns MpdClient once greeting is received. */
export const connectMpd = (host: string, port: number): ResultAsync<MpdClient, MpdClientError> =>
  ResultAsync.fromPromise(
    new Promise<MpdClient>((resolveConn, rejectConn) => {
      const socket = net.createConnection({ host, port });
      const queue: PendingCommand[] = [];
      let buf = "";
      let currentLines: string[] = [];
      let greeted = false;

      const sendCmd = (command: string): ResultAsync<string[], MpdClientError> =>
        ResultAsync.fromPromise(
          new Promise<string[]>((resolve, reject) => {
            queue.push({ resolve, reject });
            socket.write(`${command}\n`);
          }),
          (e) => e as MpdClientError,
        );

      const client: MpdClient = { cmd: sendCmd, close: () => socket.destroy() };

      const handleGreeting = (line: string): void => {
        if (line.startsWith("OK MPD")) {
          greeted = true;
          resolveConn(client);
        } else {
          socket.destroy();
          rejectConn({ message: `MPD greeting failed: ${line}` });
        }
      };

      const handleCommand = (line: string): void => {
        if (line === "OK") {
          const pending = queue.shift();
          const lines = currentLines;
          currentLines = [];
          pending?.resolve(lines);
        } else if (line.startsWith("ACK ")) {
          const pending = queue.shift();
          currentLines = [];
          pending?.reject({ message: line.slice(4) });
        } else {
          currentLines.push(line);
        }
      };

      const onLine = (line: string): void => {
        if (!greeted) {
          handleGreeting(line);
          return;
        }
        handleCommand(line);
      };

      socket.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        let nl = buf.indexOf("\n");
        while (nl !== -1) {
          onLine(buf.slice(0, nl));
          buf = buf.slice(nl + 1);
          nl = buf.indexOf("\n");
        }
      });

      socket.on("error", (e) => {
        if (!greeted) rejectConn({ message: e.message });
        const all = queue.splice(0);
        for (const p of all) p.reject({ message: e.message });
      });

      socket.on("close", () => {
        const all = queue.splice(0);
        for (const p of all) p.reject({ message: "MPD connection closed" });
      });
    }),
    (e) => ({ message: e instanceof Error ? e.message : String(e) }),
  );
