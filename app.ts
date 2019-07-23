import { MatrixClient } from "matrix-bot-sdk";
import cliArgs from "command-line-args";

interface IClientSet {
    client: MatrixClient;
    userId: string;
    joinedRooms: string[];
}

function getClients(homeservers: [{accessToken: string, url: string}]) {
    return homeservers.map((hs) => 
        new MatrixClient(hs.url, hs.accessToken)    
    );
}

async function diffStateForRoom(roomId: string, clients: IClientSet[]) {
    console.log(`Checking state for ${roomId}`);
    let state = [];
    for (const client of clients) {
        if (!client.joinedRooms.includes(roomId)) {
            try {
                await client.client.joinRoom(roomId);
            } catch (ex) {
                console.error("Couldn't join room:", ex);
                continue;
            }
            client.joinedRooms.push(roomId);
        }
    }
    clients.forEach((client) => {
        if (!client.joinedRooms.includes(roomId)) {
            client.client.joinRoom(roomId);
        }
    });
}

async function main() {
    const args = cliArgs([
        {
            name: "config",
            alias: "c",
            type: String,
            defaultValue: "./config.json",
        },
        {
            name: "roomIds",
            type: String,
            defaultOption: true,
            multiple: true,
        }
    ]) as { config: string, roomIds: string[] };
    
    let cfg;
    try {
        cfg = require(args.config);
    } catch (ex) {
        console.error(`Config ${args.config} failed to load:`, ex);
        return;
    }

    let clients: IClientSet[] = [];

    try {
        let clis = getClients(cfg.homeservers);
        const userIds = await Promise.all(clis.map(c => 
            c.getUserId()
        ));
        console.log("Got userIds", userIds);
        const joinedRooms = await Promise.all(clis.map(c => 
            c.getJoinedRooms()
        ));
        console.log("Got joined rooms");
        for (let i = 0; i < clis.length; i++) {
            clients.push({
                client: clis[i],
                userId: userIds[i],
                joinedRooms: joinedRooms[i],
            });
        }
    } catch (ex) {
        console.error("Failed to access homeserver(s)", ex);
        return;
    }
    
    if (!args.roomIds) {
        console.log("roomId not specified, not proceeding.");
        return;
    }

    await Promise.all(args.roomIds.map((roomId) => 
        diffStateForRoom(roomId, clients)
    ));
}


main();