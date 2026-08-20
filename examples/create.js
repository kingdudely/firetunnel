import { setTimeout } from "node:timers/promises";
import Tunnel from "firetunnel";

await Tunnel.installCloudflared();

const tunnel = new Tunnel({
	"url": "localhost:8080",
    "metrics": "localhost:8081"
});

while (!await tunnel.isReady()) await setTimeout(1000);

const { hostname } = await tunnel.getQuickTunnelInfo();
console.log(`Hostname: ${hostname}`);

const exitInfo = await tunnel.exited;
console.log(`Exit info: ${JSON.stringify(exitInfo, null, 2)}`);