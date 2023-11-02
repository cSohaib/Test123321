start();

function start() {
    let game = initGame();

    while (true) {
        processInput(game, readInput());

        console.log(makeTurn(game, gameStrategy1));
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
            input.troops.push({ id: parseInt(inputs[0]), owner: parseInt(inputs[2]), source: parseInt(inputs[3]), target: parseInt(inputs[4]), cyborgs: parseInt(inputs[5]), distance: parseInt(inputs[6]) });
        else if (inputs[1] == "BOMB")
            input.bombs.push({ id: parseInt(inputs[0]), owner: parseInt(inputs[2]), source: parseInt(inputs[3]), target: parseInt(inputs[4]), distance: parseInt(inputs[5]) });
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

    input.troops.forEach(t => game.factories[t.target].troops.push({ owner: t.owner, cyborgs: t.cyborgs, distance: t.distance }));

    input.bombs.forEach(nb => {
        let bomb = game.bombs.find(b => b.id == nb.id);
        if (!bomb) {
            bomb = { id: nb.id, owner: nb.owner, source: nb.source, destination: nb.target, isExploded: false, turnsSinceLaunched: 0 };
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
    gameStrategy(game,
        (source, destination, cyborgs) => commands.push(["MOVE", source, destination, cyborgs].join(' ')),
        (source, destination) => commands.push(["BOMB", source, destination].join(' ')),
        msg => message = msg
    );
    if (message) commands.push("MSG " + message);
    if (!commands.length) commands.push("WAIT");
    let output = commands.join(';');
    return output;
}

function gameStrategy1(game, sendTroops, sendBombs, sendMessage) {
    let copyOfGame = deepCopy(game);
    let futureGame = deepCopy(game);

    futureGame.factories.forEach(factory => {
        let turns = factory.troops.length ? Math.max(...factory.troops.map(t => t.distance)) : 1;
        var bombs = futureGame.bombs.filter(b => !b.isExploded && b.destination == factory.id);
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
                    factory.cyborgs = factory.cyborgs > 20 ? factory.cyborgs / 2 : factory.cyborgs > 10 ? factory.cyborgs - 10 : 0;
                }
            });
            if (factory.owner != 0 && factory.onHold <= 0)
                factory.cyborgs += factory.production;
            factory.onHold--;
        }
    });

    var attackers = copyOfGame.factories.filter(f => f.owner == 1 && futureGame.factories[f.id].owner == 1 && f.cyborgs > 0 && futureGame.factories[f.id].cyborgs > 0);
    foreach (var attacker in attackers)
        attacker.cyborgs = Math.min(attacker.cyborgs, futureGame.factories[attacker.id].cyborgs);
    int availableCyborgs = attackers.sum(f => f.cyborgs);

    while (availableCyborgs > 0)
    {
        var dest = futureGame.factories.where(f => f.owner != 1
                            && (!bombs.any(b => b.isExploded == false && b.destination == f.id)
                                            || attackers.any(a => f.links.first(l => l.factory == a.id).distance > bombs.first(b => b.isExploded == false && b.destination == f.id).distance)))
                .orderBy(f => factories[f.id].owner == 1 ? 0
                                : factories[f.id].troops.any(t => t.owner == 1) || bombs.any(b => b.owner == 1 && !b.isExploded && b.destination == f.id) ? 1
                                : factories[f.id].owner == 0 ? 2 : 3)
                .thenByDescending(f =>
                    {
                        int distance = 0;
                        int sourcesCount = 0;
                        int cyborgs = 0;
                        var sources = f.links.where(l => attackers.any(a => a.id == l.factory)).orderBy(l => l.distance);
                        foreach (var source in sources)
                        {
                            distance += source.distance;
                            sourcesCount++;
                            cyborgs += Math.min(factories[source.factory].cyborgs, futureGame.factories[source.factory].cyborgs);
                            if (cyborgs > futureGame.factories[f.id].cyborgs) break;
                        }
                        float score = (float)f.production / ((float)factories[f.id].cyborgs + ((float)distance / (float)sourcesCount));
                        return score;
                    })
                .firstOrDefault();

        if (dest is null) break;

        if (factories[dest.id].owner == -1 && remainingBombs > 0 && !factories[dest.id].troops.any(t => t.owner == 1) && !bombs.any(b => b.destination == dest.id))
        {
            remainingBombs--;
            int source = dest.links.where(l => factories[l.factory].owner == 1).orderBy(l => l.distance).first().factory;

            if (attackers.any(a => a.id == source))
            {
                var attacker = attackers.first(a => a.id == source);
                availableCyborgs -= attacker.cyborgs;
                attacker.cyborgs = 0;
                attackers.remove(attacker);
            }
            game.sendBomb(source, dest.id);
            bombs.add(new Bomb { Destination = dest.id, Distance = dest.links.first(l => l.factory == source).distance, IsExploded = false, Owner = 1, Source = source });
        }

        while (availableCyborgs > 0 && dest.owner != 1)
        {
            var source = attackers.where(a => !bombs.any(b => b.isExploded == false && b.destination == dest.id)
                                            || dest.links.first(l => l.factory == a.id).distance > bombs.first(b => b.isExploded == false && b.destination == dest.id).distance)
                            .orderBy(a => dest.links.first(l => l.factory == a.id).distance).firstOrDefault();
            if (source == null) break;
            int cyborgs = Math.min(dest.cyborgs + 1, source.cyborgs);
            dest.cyborgs -= cyborgs;
            source.cyborgs -= cyborgs;
            availableCyborgs -= cyborgs;
            if (dest.cyborgs < 0) dest.owner = 1;
            if (source.cyborgs == 0) attackers.remove(source);
            game.sendTroops(source.id, dest.id, cyborgs);
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
