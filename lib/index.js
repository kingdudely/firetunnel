import { spawn } from "node:child_process";
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { install, bin } from "cloudflared";
import parsePrometheusText from "parse-prometheus-text-format";

await Tunnel.installCloudflared();

export default class Tunnel {
	static cloudflaredPath = bin;
	static async installCloudflared() {
		if (!await fileExists(Tunnel.cloudflaredPath)) {
			await install(Tunnel.cloudflaredPath);
		}
	}

	#getMetricEndpoint(pathname) {
		if ("metrics" in this.arguments) {
			return Promise.race([
				fetch(`http://${this.arguments.metrics}/${pathname}`),
				this.exited.then((result) => {
					throw new Error(`Tunnel process ended before request completed: ${JSON.stringify(result)}`);
				})
			]);
		} else {
			throw new Error("Metrics argument was not set");
		}
	}

	constructor(args = {}) {
		this.arguments = Object.freeze(args);
		this.process = spawn(Tunnel.cloudflaredPath, getArgsFromDictionary(this.arguments), {
			stdio: ['ignore', 'ignore', 'pipe'] // capture stderr, ignore stdin/stdout
		});

		let stderr = "";
		this.process.stderr.on('data', (chunk) => {
			stderr += chunk.toString();
		});

		this.exited = new Promise((resolve) => {
			this.process.on('error', (error) => {
				resolve({
					"type": "error",
					"error": error,
					"stderr": stderr
				});
			});

			this.process.on('exit', (code, signal) => {
				resolve({
					"type": "exit",
					"code": code,
					"signal": signal,
					"stderr": stderr
				});
			});
		});
	}

	get isRunning() {
		return this.process.exitCode === null && !this.process.killed;
	}

	async isReady() {
		if (!this.isRunning) return false;

		try {
			const response = await this.#getMetricEndpoint("ready");
			return response.ok;
		} catch {
			return false;
		}
	}

	async getHealth() {
		const response = await this.#getMetricEndpoint("healthcheck");
		return response.text();
	}

	async getMetrics() {
		const response = await this.#getMetricEndpoint("metrics");
		return parsePrometheusText(await response.text());
	}

	async getQuickTunnelInfo() {
		const response = await this.#getMetricEndpoint("quicktunnel");
		return response.json();
	}

	close(signal = 'SIGTERM') {
		if (this.isRunning) {
			this.process.kill(signal);
		};

		return this.exited;
	}
}

function getArgsFromDictionary(argDictionary) {
	const args = [];
	for (const [key, value] of Object.entries(argDictionary)) {
		args.push(`--${key}=${value}`);
	}
	return args;
}

async function fileExists(path) {
	try {
		await access(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}