start();

function start() {
    let game = initGame();

    while (true) {
        processInput(game, readInput());

        console.log(makeTurn(game, gameStrategy2));
    }
}

function initGame() {
    let game = {
        myRemainingBombs: 2,
        opponentRemainingBombs: 2,
        bombs: []
    };

    let factoryCount = parseInt(readline());
    let linkCount = parseInt(readline());
    let links = [];
    for (let i = 0; i < linkCount; i++) {
        let inputs = readline().split(' ');
        links.push({ factory1: parseInt(inputs[0]), factory2: parseInt(inputs[1]), distance: parseInt(inputs[2]) })
    }
    game.factories = Array.from({ length: factoryCount }, (_, i) => ({ id: i, links: [] }));
    links.forEach(link => {
        game.factories[link.factory1].links.push({ factory: link.factory2, distance: link.distance });
        game.factories[link.factory2].links.push({ factory: link.factory1, distance: link.distance });
    });
    return game;
}

function readInput() {
    let entityCount = parseInt(readline()); // the number of entities (e.g. factories and troops)
    let input = { factories: [], troops: [], bombs: [] };
    for (let i = 0; i < entityCount; i++) {
        let inputs = readline().split(' ');
        if (inputs[1] == "FACTORY")
            input.factories.push({ id: parseInt(inputs[0]), ownerId: parseInt(inputs[2]), cyborgs: parseInt(inputs[3]), production: parseInt(inputs[4]), onHold: parseInt(inputs[5]) });
        else if (inputs[1] == "TROOP")
            input.troops.push({ id: parseInt(inputs[0]), owner: parseInt(inputs[2]), source: parseInt(inputs[3]), destination: parseInt(inputs[4]), cyborgs: parseInt(inputs[5]), distance: parseInt(inputs[6]) });
        else if (inputs[1] == "BOMB")
            input.bombs.push({ id: parseInt(inputs[0]), owner: parseInt(inputs[2]), source: parseInt(inputs[3]), destination: parseInt(inputs[4]), distance: parseInt(inputs[5]) });
    }
    return input;
}

function processInput(game, input) {
    game.bombs.filter(eb => !eb.isExploded && !input.bombs.some(nb => nb.id == eb.id)).forEach(eb => eb.isExploded = true);

    input.factories.forEach(f => {
        game.factories[f.id].owner = f.ownerId;
        game.factories[f.id].cyborgs = f.cyborgs;
        game.factories[f.id].production = f.production;
        game.factories[f.id].onHold = f.onHold;
        game.factories[f.id].troops = [];
    });

    input.troops.forEach(t => game.factories[t.destination].troops.push({ owner: t.owner, cyborgs: t.cyborgs, distance: t.distance }));

    input.bombs.forEach(nb => {
        let bomb = game.bombs.find(b => b.id == nb.id);
        if (!bomb) {
            bomb = { id: nb.id, owner: nb.owner, source: nb.source, destination: nb.destination, isExploded: false, turnsSinceLaunched: 0 };
            game.bombs.push(bomb);
            if (nb.owner == 1) game.myRemainingBombs--;
            if (nb.owner == -1) game.opponentRemainingBombs--;
        }
        bomb.distance = nb.distance;
        bomb.turnsSinceLaunched++;
    });
}

function makeTurn(game, gameStrategy) {
    let commands = [];
    let message = "";
    try {
        gameStrategy(game,
            (source, destination, cyborgs) => commands.push(["MOVE", source, destination, cyborgs].join(' ')),
            (source, destination) => commands.push(["BOMB", source, destination].join(' ')),
            (factory) => commands.push(["INC", factory].join(' ')),
            msg => message = msg
        );
    }
    catch (error) {
        console.error(error);
    }
    if (message) commands.push("MSG " + message);
    if (!commands.length) commands.push("WAIT");
    let output = commands.join(';');
    return output;
}

function gameStrategy2(game, sendTroops, sendBombs, increaseProduction, sendMessage) {
    let copyOfGame = deepCopy(game);

    let attackCyborgs = copyOfGame.factories.map(f => f.owner == 1 ? f.cyborgs : 0);

    let availableCyborgs = attackCyborgs.reduce((sum, cyborgs) => sum + cyborgs, 0);

    while (availableCyborgs) {
        let possibleMoves = [];
        copyOfGame.factories.forEach(factory => {
            if (factory.owner == 1 && factory.troops.some(t => t.owner == -1)) {
                // the goal is to prevent enemy to take over
                let cyborgs = factory.cyborgs;
                let score = {
                    factory: factory.id,
                    type: "PROTECT",
                    opCyborgs: 0,
                    myCyborgs: 0,
                    myProduction: 0,
                    opProduction: factory.production,
                    turns: 0
                };
                while (cyborgs >= 0 && score.turns < 100) {
                    factory.troops.forEach(t => cyborgs += t.distance == score.turns ? t.owner * t.cyborgs : 0);
                    cyborgs += factory.production;
                    score.turns++;
                }
                possibleMoves.push(score);
            }

            if (factory.owner == 1 && factory.production < 3) {
                // the goal is to upgrade the factory
                let cyborgs = 10 - factory.cyborgs;
                let score = {
                    factory: factory.id,
                    type: "UPGRADE",
                    opCyborgs: 0,
                    myCyborgs: 10,
                    myProduction: 1,
                    opProduction: 0,
                    turns: 0
                };
                while (cyborgs > 0 && score.turns < 100) {
                    cyborgs -= factory.production;
                    factory.troops.forEach(t => cyborgs -= t.distance == score.turns ? t.owner * t.cyborgs : 0);
                    factory.links.forEach(l => {
                        let f = copyOfGame.factories[l.factory];
                        if (f.owner == 1) {
                            if (l.distance == score.turns)
                                cyborgs -= f.cyborgs + f.production * l.distance;
                            else if (l.distance < score.turns)
                                cyborgs -= f.production;
                        }
                    });
                    score.turns++;
                }
                possibleMoves.push(score);
            }

            if (factory.owner == 0) {
                // Take
                let cyborgs = factory.cyborgs;
                let score = {
                    factory: factory.id,
                    type: "TAKE",
                    opCyborgs: 0,
                    myCyborgs: 0,
                    myProduction: factory.production,
                    opProduction: 0,
                    turns: 0
                };
                while (score.myCyborgs <= cyborgs && score.turns < 100) {
                    factory.troops.forEach(t => cyborgs -= t.distance == score.turns ? t.owner * t.cyborgs : 0);
                    factory.links.forEach(l => {
                        let f = copyOfGame.factories[l.factory];
                        if (f.owner == 1) {
                            if (l.distance == score.turns)
                                score.myCyborgs += f.cyborgs + f.production * l.distance;
                            else if (l.distance < score.turns)
                                score.myCyborgs += f.production;
                        }
                    });
                    score.turns++;
                }
                possibleMoves.push(score);
            }

            if (factory.owner != 1) {
                // Attack
                let cyborgs = factory.cyborgs;
                let owned = factory.owner == -1;
                let ownedTurn = 0;
                let score = {
                    factory: factory.id,
                    type: "ATTACK",
                    opCyborgs: 0,
                    myCyborgs: 0,
                    myProduction: factory.production,
                    opProduction: factory.production,
                    turns: 0
                };
                while (score.turns < 100) {
                    let newCyborgs = factory.troops.reduce((sum, t) => sum += t.distance == score.turns ? t.owner * t.cyborgs : 0, 0);
                    if (owned) cyborgs += factory.production;
                    if (newCyborgs > 0) {
                        cyborgs -= newCyborgs;
                        if (cyborgs <= 0)
                            score.turns = 100;
                    }
                    else {
                        if (owned)
                            cyborgs -= newCyborgs;
                        else {
                            cyborgs += newCyborgs;
                            if (cyborgs < 0) {
                                cyborgs *= -1;
                                score.opCyborgs = score.opCyborgs - newCyborgs - cyborgs;
                                owned = true;
                                ownedTurn = score.turns;
                            }
                            else
                                score.opCyborgs -= newCyborgs;
                        }
                    }
                    if (owned) {
                        let attack = factory.links.reduce((sum, l) => {
                            let f = copyOfGame.factories[l.factory];
                            if (f.owner == 1 && l.distance <= score.turns) {
                                sum += f.cyborgs + f.production * (score.turns - ownedTurn);
                            }
                            return sum;
                        }, 0);
                        if (attack > cyborgs)
                            break;
                    }
                    score.turns++;
                }
                possibleMoves.push(score);
            }
        });
        let calculeScore = s => (s.myProduction + s.opProduction / 2 + s.opCyborgs) / (s.myCyborgs / 2 + s.turns + 0.001);
        let nextMove = possibleMoves.sort((a, b) => calculeScore(b) - calculeScore(a))[0];
        while (nextMove) {
            if (nextMove.type == "PROTECT") {
                let neededCyborgs = copyOfGame.factories[nextMove.factory].troops.reduce((sum, t) => sum - (t.distance <= nextMove.turns ? t.owner * t.cyborgs : 0), 0);
                neededCyborgs -= (copyOfGame.factories[nextMove.factory].cyborgs + copyOfGame.factories[nextMove.factory].production * nextMove.turns);

                for (i = 0; neededCyborgs > 0 && i < copyOfGame.factories.length; i++) {
                    if (i != nextMove.factory) {
                        let distance = copyOfGame.factories[nextMove.factory].links.find(l => l.factory == i).distance;
                        if (attackCyborgs[i] > 0 && distance <= nextMove.turns) {
                            let cyborgs = Math.min(neededCyborgs, attackCyborgs[i]);
                            sendTroops(i, nextMove.factory, cyborgs)
                            attackCyborgs[i] -= cyborgs;
                            availableCyborgs -= cyborgs;
                            copyOfGame.factories[nextMove.factory].troops.push({ owner: 1, cyborgs: cyborgs, distance: distance });
                            copyOfGame.factories[i].cyborgs -= cyborgs;
                        }
                    }
                }
                availableCyborgs -= attackCyborgs[nextMove.factory];
                attackCyborgs[nextMove.factory] = 0;
            }
            if (nextMove.type == "UPGRADE") {
                if (attackCyborgs[nextMove.factory] >= 10) {
                    increaseProduction(nextMove.factory);
                } else {
                    let neededCyborgs = 10 + copyOfGame.factories[nextMove.factory].troops.reduce((sum, t) => sum - (t.distance <= nextMove.turns ? t.owner * t.cyborgs : 0), 0);
                    neededCyborgs -= (copyOfGame.factories[nextMove.factory].cyborgs + copyOfGame.factories[nextMove.factory].production * nextMove.turns);

                    for (i = 0; neededCyborgs > 0 && i < copyOfGame.factories.length; i++) {
                        if (i != nextMove.factory) {
                            let distance = copyOfGame.factories[nextMove.factory].links.find(l => l.factory == i).distance;
                            if (attackCyborgs[i] > 0 && distance <= nextMove.turns) {
                                let cyborgs = Math.min(neededCyborgs, attackCyborgs[i]);
                                sendTroops(i, nextMove.factory, cyborgs)
                                attackCyborgs[i] -= cyborgs;
                                availableCyborgs -= cyborgs;
                                copyOfGame.factories[nextMove.factory].troops.push({ owner: 1, cyborgs: cyborgs, distance: distance });
                                copyOfGame.factories[i].cyborgs -= cyborgs;
                            }
                        }
                    }
                }
                availableCyborgs -= attackCyborgs[nextMove.factory];
                attackCyborgs[nextMove.factory] = 0;
            }
            if (nextMove.type == "TAKE") {
                for (i = 0; i < copyOfGame.factories.length; i++) {
                    if (i != nextMove.factory) {
                        let distance = copyOfGame.factories[nextMove.factory].links.find(l => l.factory == i).distance;
                        if (attackCyborgs[i] > 0 && distance <= nextMove.turns) {
                            let cyborgs = attackCyborgs[i];
                            sendTroops(i, nextMove.factory, cyborgs)
                            attackCyborgs[i] -= cyborgs;
                            availableCyborgs -= cyborgs;
                            copyOfGame.factories[nextMove.factory].troops.push({ owner: 1, cyborgs: cyborgs, distance: distance });
                            copyOfGame.factories[i].cyborgs -= cyborgs;
                        }
                    }
                }
            }
            if (nextMove.type == "ATTACK") {
                let bomb = copyOfGame.bombs.find(b => !b.isExploded && b.destination == nextMove.factory);
                let bombDistance = bomb ? copyOfGame.factories[bomb.destination].links.find(l => l.factory == bomb.source).distance - bomb.turnsSinceLaunched : 0;
                if (copyOfGame.myRemainingBombs > 0
                    && bombDistance == 0
                    && copyOfGame.factories[nextMove.factory].owner == -1
                    && !copyOfGame.factories[nextMove.factory].troops.some(t => t.owner == 1)) {
                    let source = copyOfGame.factories[nextMove.factory].links.filter(l => copyOfGame.factories[l.factory].owner == 1).sort((l1, l2) => l1.distance - l2.distance)[0];
                    bombDistance = source.distance;
                    sendBombs(source.factory, nextMove.factory);
                    copyOfGame.bombs.push({ destination: nextMove.factory, distance: source.distance, isExploded: false, owner: 1, source: source.factory, turnsSinceLaunched: 0 });
                    availableCyborgs -= attackCyborgs[source.factory];
                    attackCyborgs[source.factory] = 0;
                    sendMessage("hooooray");
                }
                for (i = 0; i < copyOfGame.factories.length; i++) {
                    if (i != nextMove.factory) {
                        let distance = copyOfGame.factories[nextMove.factory].links.find(l => l.factory == i).distance;
                        if (attackCyborgs[i] > 0 && distance <= nextMove.turns) {
                            let cyborgs = attackCyborgs[i];
                            attackCyborgs[i] -= cyborgs;
                            availableCyborgs -= cyborgs;
                            if (distance > bombDistance && distance == nextMove.turns) {
                                sendTroops(i, nextMove.factory, cyborgs)
                                copyOfGame.factories[nextMove.factory].troops.push({ owner: 1, cyborgs: cyborgs, distance: distance });
                                copyOfGame.factories[i].cyborgs -= cyborgs;
                            }
                        }
                    }
                }
            }
        }

            // the problem maybe is, even after doing the attack, it's still the best next move considering the coming turns
            // but in that case we will not use the cyborgs that are not needed for this attack
            // so we will stuck in the boucle because we still have cyborgs
    }
}

function gameStrategy1(game, sendTroops, sendBombs, increaseProduction, sendMessage) {
    let copyOfGame = deepCopy(game);
    let futureGame = deepCopy(game);

    futureGame.factories.forEach(factory => {
        let turns = factory.troops.length ? Math.max(...factory.troops.map(t => t.distance)) : 1;
        let bombs = futureGame.bombs.filter(b => !b.isExploded && b.destination == factory.id);
        for (i = 0; i < turns; i++) {
            for (j = 0; j < factory.troops.length; j++) {
                if (factory.troops[j].distance == 0) {
                    if (factory.troops[j].owner == factory.owner)
                        factory.cyborgs += factory.troops[j].cyborgs;
                    else if (factory.troops[j].cyborgs < factory.cyborgs)
                        factory.cyborgs -= factory.troops[j].cyborgs;
                    else if (factory.troops[j].cyborgs >= factory.cyborgs) {
                        factory.owner = factory.troops[j].owner;
                        factory.cyborgs = factory.troops[j].cyborgs - factory.cyborgs;
                    }
                }
                factory.troops[j].distance--;
            }
            bombs.forEach(bomb => {
                bomb.distance--;
                if (bomb.distance == 0) {
                    factory.onHold = 5;
                    factory.cyborgs = factory.cyborgs > 20 ? Math.floor(factory.cyborgs / 2) : factory.cyborgs > 10 ? factory.cyborgs - 10 : 0;
                }
            });
            if (factory.owner != 0 && factory.onHold <= 0)
                factory.cyborgs += factory.production;
            factory.onHold--;
        }
    });

    var attackers = copyOfGame.factories.filter(f => f.owner == 1 && futureGame.factories[f.id].owner == 1 && f.cyborgs > 0 && futureGame.factories[f.id].cyborgs > 0);
    attackers.forEach(attacker => attacker.cyborgs = Math.min(attacker.cyborgs, futureGame.factories[attacker.id].cyborgs));

    let availableCyborgs = attackers.reduce((sum, factory) => sum + factory.cyborgs, 0);

    let calculeScore = (f) => {
        let score = copyOfGame.factories[f.id].owner == 1 ? 3000
            : copyOfGame.factories[f.id].troops.some(t => t.owner == 1) || copyOfGame.bombs.some(b => b.owner == 1 && !b.isExploded && b.destination == f.id) ? 2000
                : copyOfGame.factories[f.id].owner == 0 ? 1000 : 0;

        let distance = 0;
        let sourcesCount = 0;
        let cyborgs = 0;

        var sources = f.links.filter(l => attackers.some(a => a.id == l.factory)).sort((l1, l2) => l1.distance - l2.distance);
        sources.forEach(source => {
            if (cyborgs > futureGame.factories[f.id].cyborgs) return;
            distance += source.distance;
            sourcesCount++;
            cyborgs += Math.min(copyOfGame.factories[source.factory].cyborgs, futureGame.factories[source.factory].cyborgs);
        });
        score += f.production / (copyOfGame.factories[f.id].cyborgs + (distance / sourcesCount));
        return score;
    }

    while (availableCyborgs > 0) {
        var dest = futureGame.factories.filter(f => f.owner != 1
            && (!copyOfGame.bombs.some(b => b.isExploded == false && b.destination == f.id)
                || attackers.some(a => f.links.find(l => l.factory == a.id).distance > copyOfGame.bombs.find(b => b.isExploded == false && b.destination == f.id).distance)))
            .sort((f1, f2) => calculeScore(f2) - calculeScore(f1))[0];

        if (!dest) break;

        if (copyOfGame.factories[dest.id].owner == -1 && copyOfGame.myRemainingBombs > 0 && !copyOfGame.factories[dest.id].troops.some(t => t.owner == 1) && !copyOfGame.bombs.some(b => b.destination == dest.id)) {
            copyOfGame.myRemainingBombs--;
            let source = dest.links.filter(l => copyOfGame.factories[l.factory].owner == 1).sort((l1, l2) => l1.distance - l2.distance)[0].factory;

            if (attackers.some(a => a.id == source)) {
                var attacker = attackers.find(a => a.id == source);
                availableCyborgs -= attacker.cyborgs;
                attacker.cyborgs = 0;
                attackers.splice(attackers.findIndex(f => f.id == attacker.id), 1);
            }
            sendBombs(source, dest.id);
            copyOfGame.bombs.push({ destination: dest.id, distance: dest.links.find(l => l.factory == source).distance, isExploded: false, owner: 1, source: source, turnsSinceLaunched: 0 });
        }

        while (availableCyborgs > 0 && dest.owner != 1) {
            var source = attackers.filter(a => !copyOfGame.bombs.some(b => b.isExploded == false && b.destination == dest.id)
                || dest.links.find(l => l.factory == a.id).distance > copyOfGame.bombs.find(b => b.isExploded == false && b.destination == dest.id).distance)
                .sort((a, b) => dest.links.find(l => l.factory == a.id).distance - dest.links.find(l => l.factory == b.id).distance)[0];
            if (source == null) break;
            let cyborgs = Math.min(dest.cyborgs + 1, source.cyborgs);
            dest.cyborgs -= cyborgs;
            source.cyborgs -= cyborgs;
            availableCyborgs -= cyborgs;
            if (dest.cyborgs < 0) dest.owner = 1;
            if (source.cyborgs == 0) attackers.splice(attackers.findIndex(f => f.id == source.id), 1);
            sendTroops(source.id, dest.id, cyborgs);
        }
    }
}

function deepCopy(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    const copy = Array.isArray(obj) ? [] : {};

    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            copy[key] = deepCopy(obj[key]);
        }
    }

    return copy;
}
