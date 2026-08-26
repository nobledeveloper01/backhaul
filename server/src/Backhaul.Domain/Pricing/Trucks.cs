namespace Backhaul.Domain.Pricing;

public enum TruckClass
{
    Pickup,
    Canter,
    Truck15t,
    Trailer30t,
    Lowbed,
}

public static class Trucks
{
    /// <summary>Tonnes.</summary>
    public static readonly IReadOnlyDictionary<TruckClass, decimal> Capacity =
        new Dictionary<TruckClass, decimal>
        {
            [TruckClass.Pickup] = 1m,
            [TruckClass.Canter] = 5m,
            [TruckClass.Truck15t] = 15m,
            [TruckClass.Trailer30t] = 30m,
            [TruckClass.Lowbed] = 40m,
        };

    private static readonly Dictionary<TruckClass, string> WireMap = new()
    {
        [TruckClass.Pickup] = "pickup",
        [TruckClass.Canter] = "canter",
        [TruckClass.Truck15t] = "truck_15t",
        [TruckClass.Trailer30t] = "trailer_30t",
        [TruckClass.Lowbed] = "lowbed",
    };

    private static readonly Dictionary<string, TruckClass> FromWireMap =
        WireMap.ToDictionary(pair => pair.Value, pair => pair.Key);

    public static string ToWire(TruckClass truck) => WireMap[truck];

    public static TruckClass? FromWire(string wire) =>
        FromWireMap.TryGetValue(wire, out var truck) ? truck : null;

    public static IReadOnlyList<TruckClass> All { get; } = [.. WireMap.Keys];

    public static bool Fits(TruckClass truck, decimal weightTonnes) =>
        weightTonnes <= Capacity[truck];

    /// <summary>The smallest class that carries the load, or null if nothing does.</summary>
    /// <remarks>
    /// Smallest, not cheapest per tonne: an over-large truck costs more per
    /// trip and is harder to find, and a shipper who wanted a trailer can ask
    /// for one. Null rather than the biggest truck — returning a lowbed for an
    /// 80-tonne load puts a shipper on a truck that cannot take it, and they
    /// find out at the depot.
    /// </remarks>
    public static TruckClass? SmallestFor(decimal weightTonnes)
    {
        foreach (var truck in Capacity.OrderBy(pair => pair.Value).Select(pair => pair.Key))
        {
            if (Fits(truck, weightTonnes))
            {
                return truck;
            }
        }

        return null;
    }
}
