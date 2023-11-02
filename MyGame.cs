using System;
using System.Linq;
using System.IO;
using System.Text;
using System.Collections;
using System.Collections.Generic;
class Player
{
    private static string Debug { get; set; } = "Started";
    static GameHandler handler;

    static void Main(string[] args)
    {
        handler = new();
        // game loop
        while (true)
        {
            Game game = handler.GetGameTurn();
            try
            {
                AttackStrategy3(game);
            }
            catch (Exception ex)
            {
                handler.Log(ex.Message);
                game.SendMessage($"MSG {Debug}: {ex.Message}");
            }
            handler.FinishTurn();
        }
    }
//How much production will be added to me
//How much Cyborgs I may lose in this attack
//How much distance

//P/(C+D)

    private static void AttackStrategy3(Game game)
    {
        var factories = game.Factories.Select(f => Factory.Copy(f)).ToArray();
        var futureFactories = game.Factories.Select(f => Factory.Copy(f)).ToArray();
        CalculateFutureFactories(futureFactories, game.Bombs.Select(b => Bomb.Copy(b)).ToArray());

        var bombs = game.Bombs.Select(b => Bomb.Copy(b)).ToList();
        int remainingBombs = game.MyRemainingBombs;

        var attackers = factories.Where(f => f.Owner == 1 && futureFactories[f.Id].Owner == 1 && f.Cyborgs > 0 && futureFactories[f.Id].Cyborgs > 0).ToList();
        foreach (var attacker in attackers)
            attacker.Cyborgs = Math.Min(attacker.Cyborgs, futureFactories[attacker.Id].Cyborgs);
        int availableCyborgs = attackers.Sum(f => f.Cyborgs);

        while (availableCyborgs > 0)
        {
            var dest = futureFactories.Where(f => f.Owner != 1
                                && (!bombs.Any(b => b.IsExploded == false && b.Destination == f.Id)
                                                || attackers.Any(a => f.Links.First(l => l.Factory == a.Id).Distance > bombs.First(b => b.IsExploded == false && b.Destination == f.Id).Distance)))
                    .OrderBy(f => factories[f.Id].Owner == 1 ? 0
                                    : factories[f.Id].Troops.Any(t => t.Owner == 1) || bombs.Any(b => b.Owner == 1 && !b.IsExploded && b.Destination == f.Id) ? 1
                                    : factories[f.Id].Owner == 0 ? 2 : 3)
                    .ThenByDescending(f =>
                        {
                            int distance = 0;
                            int sourcesCount = 0;
                            int cyborgs = 0;
                            var sources = f.Links.Where(l => attackers.Any(a => a.Id == l.Factory)).OrderBy(l => l.Distance);
                            foreach (var source in sources)
                            {
                                distance += source.Distance;
                                sourcesCount++;
                                cyborgs += Math.Min(factories[source.Factory].Cyborgs, futureFactories[source.Factory].Cyborgs);
                                if (cyborgs > futureFactories[f.Id].Cyborgs) break;
                            }
                            float score = (float)f.Production / ((float)factories[f.Id].Cyborgs + ((float)distance / (float)sourcesCount));
                            return score;
                        })
                    .FirstOrDefault();

            if (dest is null) break;

            if (factories[dest.Id].Owner == -1 && remainingBombs > 0 && !factories[dest.Id].Troops.Any(t => t.Owner == 1) && !bombs.Any(b => b.Destination == dest.Id))
            {
                remainingBombs--;
                int source = dest.Links.Where(l => factories[l.Factory].Owner == 1).OrderBy(l => l.Distance).First().Factory;

                if (attackers.Any(a => a.Id == source))
                {
                    var attacker = attackers.First(a => a.Id == source);
                    availableCyborgs -= attacker.Cyborgs;
                    attacker.Cyborgs = 0;
                    attackers.Remove(attacker);
                }
                game.SendBomb(source, dest.Id);
                bombs.Add(new Bomb { Destination = dest.Id, Distance = dest.Links.First(l => l.Factory == source).Distance, IsExploded = false, Owner = 1, Source = source });
            }

            while (availableCyborgs > 0 && dest.Owner != 1)
            {
                var source = attackers.Where(a => !bombs.Any(b => b.IsExploded == false && b.Destination == dest.Id)
                                                || dest.Links.First(l => l.Factory == a.Id).Distance > bombs.First(b => b.IsExploded == false && b.Destination == dest.Id).Distance)
                                .OrderBy(a => dest.Links.First(l => l.Factory == a.Id).Distance).FirstOrDefault();
                if (source == null) break;
                int cyborgs = Math.Min(dest.Cyborgs + 1, source.Cyborgs);
                dest.Cyborgs -= cyborgs;
                source.Cyborgs -= cyborgs;
                availableCyborgs -= cyborgs;
                if (dest.Cyborgs < 0) dest.Owner = 1;
                if (source.Cyborgs == 0) attackers.Remove(source);
                game.SendTroops(source.Id, dest.Id, cyborgs);
            }
        }
    }

    private static void CalculateFutureFactories(Factory[] futureFactories, Bomb[] futureBombs, int baseTurns = -1)
    {
        foreach (var factory in futureFactories)
        {
            CalculateFutureOfFactory(factory, futureBombs, baseTurns);
        }
    }

    private static void CalculateFutureOfFactory(Factory factory, Bomb[] futureBombs, int baseTurns = -1)
    {
        int turns = baseTurns;
        if (turns < 0) turns = factory.Troops.Any() ? factory.Troops.Max(t => t.Distance) : 1;
        var bombs = futureBombs.Where(b => !b.IsExploded && b.Destination == factory.Id);
        for (int i = 0; i < turns; i++)
        {
            for (int j = 0; j < factory.Troops.Count; j++)
            {
                if (factory.Troops[j].Distance == 0)
                {
                    if (factory.Troops[j].Owner == factory.Owner)
                        factory.Cyborgs += factory.Troops[j].Cyborgs;
                    else if (factory.Troops[j].Cyborgs < factory.Cyborgs)
                        factory.Cyborgs -= factory.Troops[j].Cyborgs;
                    else if (factory.Troops[j].Cyborgs >= factory.Cyborgs)
                    {
                        factory.Owner = factory.Troops[j].Owner;
                        factory.Cyborgs = factory.Troops[j].Cyborgs - factory.Cyborgs;
                    }
                }
                factory.Troops[j] = new(factory.Troops[j].Owner, factory.Troops[j].Cyborgs, factory.Troops[j].Distance - 1);
            }
            foreach (var bomb in bombs)
            {
                bomb.Distance--;
                if (bomb.Distance == 0)
                {
                    factory.OnHold = 5;
                    factory.Cyborgs = factory.Cyborgs > 20 ? factory.Cyborgs / 2 : factory.Cyborgs > 10 ? factory.Cyborgs - 10 : 0;
                }
            }
            if (factory.Owner != 0 && factory.OnHold <= 0)
                factory.Cyborgs += factory.Production;
            factory.OnHold--;
        }
    }
}

class Game
{
    public int MyRemainingBombs { get; private set; }
    public int OpponentRemainingBombs { get; private set; }
    string message;
    List<string> commands = new();
    private Factory[] factories;
    public IFactory[] Factories => factories;
    private List<Bomb> bombs;
    public IBomb[] Bombs => bombs.ToArray();
    public (int f1, int f2, int distance)[] Links { get; }
    public Game(int factoryCount, (int f1, int f2, int distance)[] links)
    {
        factories = Enumerable.Repeat(0, factoryCount).Select((v, i) => new Factory { Id = i }).ToArray();
        Links = links;
        bombs = new();
        MyRemainingBombs = 2;
        OpponentRemainingBombs = 2;
        foreach (var link in links)
        {
            factories[link.f1].Links.Add((link.f2, link.distance));
            factories[link.f2].Links.Add((link.f1, link.distance));
        }
    }
    public void NewTurn(
        (int id, int ownerId, int cyborgs, int production, int onHold)[] newFactories,
        (int id, int owner, int source, int target, int cyborgs, int distance)[] newTroops,
        (int id, int owner, int source, int target, int distance)[] newBombs)
    {
        var explodedBombs = bombs.Where(eb => !eb.IsExploded && !newBombs.Any(nb => nb.id == eb.Id));
        foreach (var eb in explodedBombs) eb.IsExploded = true;

        foreach (var f in newFactories)
        {
            factories[f.id].Owner = f.ownerId;
            factories[f.id].Cyborgs = f.cyborgs;
            factories[f.id].Production = f.production;
            factories[f.id].OnHold = f.onHold;
            factories[f.id].Troops.Clear();
        }
        foreach (var t in newTroops)
        {
            factories[t.target].Troops.Add(new(t.owner, t.cyborgs, t.distance));
        }
        foreach (var nb in newBombs)
        {
            var bomb = bombs.FirstOrDefault(b => b.Id == nb.id);
            if (bomb is null)
            {
                bomb = new Bomb { Id = nb.id, Owner = nb.owner, Source = nb.source, Destination = nb.target, IsExploded = false };
                bombs.Add(bomb);
                if (nb.owner == 1) MyRemainingBombs--;
                if (nb.owner == -1) OpponentRemainingBombs--;
            }
            bomb.Distance = nb.distance;
            bomb.TurnsSinceLaunched++;
        }
    }
    public void SendTroops(int source, int destination, int cyborgs)
    {
        commands.Add($"MOVE {source} {destination} {cyborgs}");
    }
    public void SendBomb(int source, int destination)
    {
        commands.Add($"BOMB {source} {destination}");
    }
    public void SendMessage(string msg) => message = msg;
    public string GenerateOutput()
    {
        if (!string.IsNullOrEmpty(message)) commands.Add("MSG " + message);
        if (commands.Count == 0) commands.Add("WAIT");
        string output = string.Join(';', commands);
        message = "";
        commands.Clear();
        return output;
    }
}

class GameHandler
{
    public Game Game { get; private set; }
    public GameHandler()
    {
        int factoryCount = int.Parse(Console.ReadLine());
        //Log("Factory Count: " + factoryCount);
        int linkCount = int.Parse(Console.ReadLine());
        //Log("Link Count: " + linkCount);
        List<(int f1, int f2, int distance)> links = new();
        for (int i = 0; i < linkCount; i++)
        {
            string linkInput = Console.ReadLine();
            //Log(linkInput);

            string[] inputs = linkInput.Split(' ');
            links.Add((int.Parse(inputs[0]), int.Parse(inputs[1]), int.Parse(inputs[2])));
        }
        Game = new(factoryCount, links.ToArray());
    }
    public Game GetGameTurn()
    {
        int entityCount = int.Parse(Console.ReadLine());
        //Log("Entity Count: " + entityCount);
        List<(int id, int ownerId, int cyborgs, int production, int onHold)> factories = new();
        List<(int id, int owner, int source, int target, int cyborgs, int distance)> troops = new();
        List<(int id, int owner, int source, int target, int distance)> bombs = new();
        for (int i = 0; i < entityCount; i++)
        {
            string entityInput = Console.ReadLine();
            //Log(entityInput);
            string[] inputs = entityInput.Split(' ');
            if (inputs[1] == "FACTORY")
                factories.Add((int.Parse(inputs[0]), int.Parse(inputs[2]), int.Parse(inputs[3]), int.Parse(inputs[4]), int.Parse(inputs[5])));
            else if (inputs[1] == "TROOP")
                troops.Add((int.Parse(inputs[0]), int.Parse(inputs[2]), int.Parse(inputs[3]), int.Parse(inputs[4]), int.Parse(inputs[5]), int.Parse(inputs[6])));
            else if (inputs[1] == "BOMB")
                bombs.Add((int.Parse(inputs[0]), int.Parse(inputs[2]), int.Parse(inputs[3]), int.Parse(inputs[4]), int.Parse(inputs[5])));
        }
        Game.NewTurn(factories.ToArray(), troops.ToArray(), bombs.ToArray());
        return Game;
    }
    public void FinishTurn() => Console.WriteLine(Game.GenerateOutput());
    public void Log(string message) => Console.Error.WriteLine(message);
}

interface IBomb
{
    public int Id { get; }
    public int Owner { get; }
    public int Source { get; }
    public int Destination { get; }
    public int Distance { get; }
    public int TurnsSinceLaunched { get; }
    public bool IsExploded { get; }
}
class Bomb : IBomb
{
    public int Id { get; set; }
    public int Owner { get; set; }
    public int Source { get; set; }
    public int Destination { get; set; }
    public int Distance { get; set; }
    public int TurnsSinceLaunched { get; set; }
    public bool IsExploded { get; set; }

    public static Bomb Copy(IBomb b)
    {
        Bomb bomb = new()
        {
            Id = b.Id,
            Owner = b.Owner,
            Source = b.Source,
            Destination = b.Destination,
            Distance = b.Distance,
            TurnsSinceLaunched = b.TurnsSinceLaunched,
            IsExploded = b.IsExploded
        };
        return bomb;
    }
}
interface IFactory
{
    public int Id { get; }
    public int Owner { get; }
    public int Cyborgs { get; }
    public int Production { get; }
    public int OnHold { get; }
    public (int Factory, int Distance)[] Links { get; }
    public (int Owner, int Cyborgs, int Distance)[] Troops { get; }
}
class Factory : IFactory
{
    public int Id { get; set; }
    public int Owner { get; set; }
    public int Cyborgs { get; set; }
    public int Production { get; set; }
    public int OnHold { get; set; }
    public List<(int Factory, int Distance)> Links { get; } = new();
    public List<(int Owner, int Cyborgs, int Distance)> Troops { get; } = new();

    (int Factory, int Distance)[] IFactory.Links => Links.ToArray();
    (int Owner, int Cyborgs, int Distance)[] IFactory.Troops => Troops.ToArray();

    public static Factory Copy(IFactory f)
    {
        var factory = new Factory
        {
            Id = f.Id,
            Owner = f.Owner,
            Cyborgs = f.Cyborgs,
            Production = f.Production,
            OnHold = f.OnHold
        };
        factory.Links.AddRange(f.Links);
        factory.Troops.AddRange(f.Troops);
        return factory;
    }
}
