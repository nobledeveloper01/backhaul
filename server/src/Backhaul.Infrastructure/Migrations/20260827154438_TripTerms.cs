using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backhaul.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TripTerms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TripTerms",
                columns: table => new
                {
                    TripId = table.Column<Guid>(type: "uuid", nullable: false),
                    Truck = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    AgreedKobo = table.Column<long>(type: "bigint", nullable: false),
                    AcceptedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DistanceM = table.Column<double>(type: "double precision", nullable: false),
                    DriverPayKobo = table.Column<long>(type: "bigint", nullable: false),
                    DriverAdvanceKobo = table.Column<long>(type: "bigint", nullable: false),
                    DriverPaidAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TripTerms", x => x.TripId);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TripTerms");
        }
    }
}
