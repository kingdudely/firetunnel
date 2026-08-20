const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { install, bin } = require("cloudflared");
const parsePrometheusText = require("parse-prometheus-text-format");

class Tunnel {
	static cloudflaredPath = bin;
	static async installCloudflared(path = Tunnel.cloudflaredPath) {
		Tunnel.cloudflaredPath = path;
		if (!existsSync(path)) {
			await install(path);
		}
	}

	async #getMetricEndpoint(pathname) {
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
		if (!existsSync(Tunnel.cloudflaredPath)) {
			throw new Error("You forgot to install Cloudflared with 'Tunnel.installCloudflared'...");
		}

		this.arguments = Object.freeze(args);
		this.process = spawn(Tunnel.cloudflaredPath, getArgsFromDictionary(this.arguments), {
			stdio: ['ignore', 'ignore', 'pipe']
		});

		let stderr = "";
		this.process.stderr.on('data', (chunk) => {
			stderr += chunk.toString();
		});

		this.exited = new Promise((resolve) => {
			this.process.once('error', (error) => {
				resolve({
					"type": "error",
					"error": error,
					"stderr": stderr
				});
			});

			this.process.once('exit', (code, signal) => {
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

	async close(signal = 'SIGTERM') {
		if (this.isRunning) {
			this.process.kill(signal);
		};

		return this.exited;
	}
}

function getArgsFromDictionary(argDictionary) {
	return Object.entries(argDictionary).map(([key, value]) => `--${key}=${value}`);
}

module.exports = Tunnel;