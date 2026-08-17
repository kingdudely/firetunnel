import { setTimeout } from "node:timers/promise"';
import Tunnel from "firetunnel";

const tunnel = new Tunnel({
	"url": "localhost:8080",
    "metrics": "localhost:8081"
});

while (!await tunnel.isReady()) await setTimeout(1000);

const { hostname } = await tunnel.getQuickTunnelInfo();

!async function() {
	const exitedInfo = await tunnel.exited;
	
}()