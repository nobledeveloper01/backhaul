using Backhaul.Domain.Access;
using Backhaul.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

/// <summary>
/// What a carrier's history says about them, counted from what happened.
/// </summary>
/// <remarks>
/// <para>
/// One reader for the two places that need it — the bid ranking a shipper sees
/// and the tier a carrier sees — because a carrier who is one thing on their
/// own screen and another on a shipper's is worse than either number alone.
/// </para>
/// <para>
/// Counted on every read rather than stored. A stored count is a stored copy
/// of a rule, and this rule has already changed once: the columns on
/// <c>CarrierProfileEntity</c> that used to hold these numbers were never
/// written by anything, so a carrier's own verification screen read three
/// zeroes while the bid ranking counted for real.
/// </para>
/// </remarks>
public static class CarrierRecord
{
    public static async Task<TrackRecord> ForAsync(
        BackhaulDbContext db,
        Guid carrierId,
        CancellationToken ct = default)
    {
        var completed = await db.Trips
            .CountAsync(t => t.CarrierId == carrierId && t.State == "delivered", ct);

        /*
            Judged only where there was a promise and a proof.

            A trip needs both to count towards punctuality: a `DeliverBy` on
            its terms, which is the only thing in this product a carrier can
            honestly be measured against, and a sealed delivery, which is the
            only thing that says when they actually arrived. A delivered trip
            missing either is not late and not on time — it is unjudged, and
            it belongs in neither half of the fraction.

            This used to be `onTime = completed`. Every carrier, every trip,
            one hundred per cent.
        */
        var judged = await db.Trips
            .Where(t => t.CarrierId == carrierId && t.State == "delivered")
            .Join(
                db.TripTerms.Where(x => x.DeliverBy != null),
                trip => trip.Id,
                terms => terms.TripId,
                (trip, terms) => new { trip.Id, terms.DeliverBy })
            /*
                Judged on the handover, not on the paperwork.

                `SealedAt` is when the driver finished filling the proof in;
                `At` is when the goods changed hands. A driver who arrives at
                five and seals it at seven — because the storekeeper had gone
                to find a pen, or because the phone had no signal until the
                yard — was on time, and scoring them on the seal would count
                the queue at the gate against them.

                The seal is still required: it is what makes the handover
                provable, and an unsealed delivery is not evidence of arrival.
            */
            .Join(
                db.Deliveries.Where(d => d.SealedAt != null),
                promised => promised.Id,
                delivery => delivery.TripId,
                (promised, delivery) => new { promised.DeliverBy, ArrivedAt = delivery.At })
            .AsNoTracking()
            .ToListAsync(ct);

        /*
            Zero, and it is not an oversight.

            `TrackRecord.Incidents` is *upheld* reports — the domain says so,
            and says an incident costs a tier. There is no upholding in this
            product and there is not going to be one: a platform that
            adjudicates its own disputes is one both sides stop trusting, which
            is why the dispute pack takes no side.

            Counting raised incidents instead would drop a carrier's tier every
            time a driver reported a breakdown or a robbery — the exact thing
            `tierOf`'s own comment says is wrong, and an incentive to stay
            quiet in a product whose evidence depends on drivers speaking up.

            So it is zero until somebody decides what upholding means and who
            does it. Written down rather than left as a number nobody can
            explain.
        */
        return new TrackRecord(
            completed,
            judged.Count,
            judged.Count(row => row.ArrivedAt <= row.DeliverBy),
            0);
    }
}
