// src/index.js – Infra Telemetry CLI
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import { stdout } from "node:process";

const DEFAULT_CONFIG = "infra-config.json";

async function loadConfig(configPath) {
  const absolute = resolve(process.cwd(), configPath);
  const data = await readFile(absolute, "utf8");
  return JSON.parse(data);
}

function fetchSource(source) {
  return new Promise((resolve, reject) => {
    const url = new URL(source);
    const lib = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = lib(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch ${source}: ${res.statusCode}`));
        return;
      }
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(raw);
          resolve(Array.isArray(parsed) ? parsed : []);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function aggregate(logEntries) {
  const summary = { info: 0, warn: 0, error: 0 };
  for (const entry of logEntries) {
    const level = (entry.level || "info").toLowerCase();
    if (level in summary) summary[level]++;
  }
  return summary;
}

function renderDashboard(summary) {
  stdout.write("
=== Infra Telemetry Dashboard ===

");
  stdout.write(`INFO : ${summary.info}
`);
  stdout.write(`WARN : ${summary.warn}
`);
  stdout.write(`ERROR: ${summary.error}
`);
  stdout.write("
Dashboard generated at " + new Date().toISOString() + "

");
}

async function main() {
  const args = process.argv.slice(2);
  const configArg = args.find((a) => a.startsWith("--config="));
  const configPath = configArg ? configArg.split("=")[1] : DEFAULT_CONFIG;
  try {
    const config = await loadConfig(configPath);
    const sources = config.sources || [];
    const allLogs = [];
    for (const src of sources) {
      const logs = await fetchSource(src);
      allLogs.push(...logs);
    }
    const summary = aggregate(allLogs);
    renderDashboard(summary);
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
