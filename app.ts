import { MatrixClient, LogService } from "matrix-bot-sdk";
import cliArgs from "command-line-args";

interface IClientSet {
    client: MatrixClient;
    userId: string;
    joinedRooms: string[];
}

LogService.setLogger({
    ...console,
    debug: () => {},
    info: () => {},
});

function getClients(homeservers: [{accessToken: string, url: string}]) {
    return homeservers.map((hs) => 
        new MatrixClient(hs.url, hs.accessToken)    
    );
}

async function diffStateForRoom(roomId: string, clients: IClientSet[]) {
    if (roomId[0] != "!") {
        roomId = "!" + roomId;
    }
    console.log(`Checking state for ${roomId}`);
    let state: (any[]|string)[] = [];
    for (const client of clients) {
        if (!client.joinedRooms.includes(roomId)) {
            try {
                await client.client.joinRoom(roomId);
            } catch (ex) {
                console.error("Couldn't join room:", ex);
                state.push("could-not-join");
                continue;
            }
            client.joinedRooms.push(roomId);
        }
        console.debug("Getting state", client.userId);
        state.push(await client.client.getRoomState(roomId));
    }
    // TODO: Hardcoded to two homeservers

    if (state[0] === "could-not-join" && state[0] === state[1]) {
        console.debug("Neither homeserver could join");
        return;
    }

    if (state[0] === "could-not-join" || state[1] === "could-not-join") {
        console.debug("One or more homeserver(s) could join");
        return;
    }

    const stateA = state[0] as any[];
    const stateB = state[1] as any[];

    const eventsInA = stateA.filter((evA) => 
        stateB.find((evB) => evA.event_id === evB.event_id) === undefined
    );

    const eventsInB = stateB.filter((evA) => {
        stateA.find((evB) => evA.event_id === evB.event_id) === undefined
    });

    if (eventsInA.length + eventsInB.length === 0) {
        console.log("State is in sync", stateA.length, stateB.length);
    }

    if (eventsInA.length > 0) {
        console.log(`${clients[0].userId} has extra state:`, eventsInA);
    }

    if (eventsInB.length > 0) {
        console.log(`${clients[1].userId} has extra state:`, eventsInB);
    }

    console.log(`Diverged state on ${clients[0].userId.split(":")[1]}: ${eventsInA.length}`);
    console.log(`Diverged state on ${clients[1].userId.split(":")[1]}: ${eventsInB.length}`);
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

    if (cfg.homeservers.length < 2) {
        console.log("One homeserver specified, not proceeding.");
        return;
    }

    await Promise.all(args.roomIds.map((roomId) => 
        diffStateForRoom(roomId, clients)
    ));
}


main();