using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;
using Backhaul.Infrastructure;
using Backhaul.Infrastructure.Entities;
using Microsoft.Extensions.DependencyInjection;

namespace Backhaul.Api.Tests;

/// <summary>
/// Phase 5's other exit condition: **match query under 2 s.**
/// </summary>
/// <remarks>
/// <para>
/// The gate had no number in it, which makes it unfalsifiable — under 2 s with
/// how many loads on the board? <see cref="Board"/> names one. Ten thousand
/// open loads is a Nigerian freight board that has worked: at a hundred a day
/// it is three months of posting with nothing expiring, and it is far past
/// where the pilot will be. If the product ever needs more than this, the
/// answer is paging and an index, not a larger number here.
/// </para>
/// <para>
/// It measures the whole request, not the ranking function: the board is read
/// from the database, mapped, filtered and ranked in the domain (ADR-0005), and
/// the interesting cost is somewhere in that chain rather than in the part that
/// is easy to microbenchmark.
/// </para>
/// <para>
/// The budget here is deliberately tighter than the gate. A test at exactly
/// 2 s passes at 1.99 s on a good day and fails on a loaded CI box for no
/// reason anybody can act on, and a flaky performance test gets deleted. This
/// one fails while there is still a factor of two of room.
/// </para>
/// </remarks>
public sealed class BoardPerformanceTests
{
    private const int Board = 10_000;

    private static readonly TimeSpan Budget = TimeSpan.FromSeconds(1);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task Ten_thousand_open_loads_rank_well_inside_the_budget()
    {
        // Its own application *and its own store*. Ten thousand rows in the
        // shared one would be paid for by every other test in the suite, and
        // — the way this first failed — two seeding tests sharing a name rank
        // twenty thousand loads between them and the count assertion below is
        // the only thing that notices.
        using var factory = new ApiFactory { StoreName = "board-perf-plain" };
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());

        Seed(factory, Board);

        // Once to warm the code paths — the first request through ASP.NET
        // routing and EF's query pipeline pays for compiling both, which is a
        // cost a real board pays once at start-up and never again.
        var warm = await client.GetAsync("/v1/loads?lat=12.0022&lon=8.5919&truck=trailer_30t");
        warm.EnsureSuccessStatusCode();

        var clock = Stopwatch.StartNew();
        var response = await client.GetAsync(
            "/v1/loads?lat=12.0022&lon=8.5919&truck=trailer_30t&baseLat=6.4531&baseLon=3.3958");
        clock.Stop();

        response.EnsureSuccessStatusCode();

        var ranked = await response.Content.ReadFromJsonAsync<List<RankedView>>(Json);

        // It actually ranked them. A query that returned nothing in no time
        // would pass a timing assertion and prove the opposite of the point.
        Assert.NotNull(ranked);
        Assert.Equal(Board, ranked!.Count);

        Assert.True(
            clock.Elapsed < Budget,
            $"{Board} loads ranked in {clock.ElapsedMilliseconds} ms, over the "
                + $"{Budget.TotalMilliseconds} ms budget. The gate is 2 s; this "
                + "is half of it so there is room to be wrong about the machine.");

        // Printed whether it passes or not. A performance test that only
        // speaks when it fails tells nobody that the margin has been shrinking
        // for a month, which is the thing worth knowing before it goes.
        Console.WriteLine($"board: {Board} loads ranked in {clock.ElapsedMilliseconds} ms");
    }

    [Fact]
    public async Task And_so_does_a_filtered_one()
    {
        // The filtered path is a different one: it runs `Search.Loads` over
        // the whole board before ranking, because ranking first and filtering
        // after scores loads that are about to be thrown away.
        using var factory = new ApiFactory { StoreName = "board-perf-filtered" };
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());

        Seed(factory, Board);

        (await client.GetAsync("/v1/loads?text=rice")).EnsureSuccessStatusCode();

        var clock = Stopwatch.StartNew();
        var response = await client.GetAsync(
            "/v1/loads?lat=12.0022&lon=8.5919&truck=trailer_30t&text=rice&minimumOfferKobo=1");
        clock.Stop();

        response.EnsureSuccessStatusCode();

        Assert.True(
            clock.Elapsed < Budget,
            $"a filtered board of {Board} took {clock.ElapsedMilliseconds} ms.");
    }

    /// <summary>A board of open loads, written straight to the store.</summary>
    /// <remarks>
    /// Through the DbContext rather than ten thousand PUTs: the endpoint is
    /// not what is being measured and posting them would take longer than the
    /// test it is setting up.
    /// </remarks>
    private static void Seed(ApiFactory factory, int count)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BackhaulDbContext>();
        var shipper = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        for (var i = 0; i < count; i++)
        {
            // Spread across the country rather than stacked on one point, so
            // the deadhead and progress-home arithmetic is doing real work on
            // every row instead of the same work.
            var lat = 4.5 + (i % 90) * 0.1;
            var lon = 3.0 + (i % 70) * 0.1;

            db.Loads.Add(new LoadEntity
            {
                Id = Guid.NewGuid(),
                ShipperId = shipper,
                OriginName = i % 2 == 0 ? "Kano" : "Onitsha",
                DestinationName = i % 3 == 0 ? "Lagos" : "Abuja",
                OriginLat = lat,
                OriginLon = lon,
                DestinationLat = 6.4531,
                DestinationLon = 3.3958,
                Cargo = i % 2 == 0 ? "Bagged rice" : "Cement",
                WeightTonnes = 26,
                Requires = "trailer_30t",
                OfferedKobo = 200_000_000 + i,
                ReadyBy = now,
                ExpiresAt = now.AddDays(2),
            });
        }

        db.SaveChanges();
    }

    private sealed record RankedView(int ScorePct);
}
