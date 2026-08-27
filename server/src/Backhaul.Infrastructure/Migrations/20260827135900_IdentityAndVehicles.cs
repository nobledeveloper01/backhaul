using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backhaul.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class IdentityAndVehicles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CarrierProfiles",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    HasIdentity = table.Column<bool>(type: "boolean", nullable: false),
                    HasLicence = table.Column<bool>(type: "boolean", nullable: false),
                    HasRegistration = table.Column<bool>(type: "boolean", nullable: false),
                    HasInsurance = table.Column<bool>(type: "boolean", nullable: false),
                    Expiries = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    TripsCompleted = table.Column<int>(type: "integer", nullable: false),
                    TripsOnTime = table.Column<int>(type: "integer", nullable: false),
                    Incidents = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CarrierProfiles", x => x.UserId);
                });

            migrationBuilder.CreateTable(
                name: "DuressSignals",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TripId = table.Column<Guid>(type: "uuid", nullable: false),
                    RaisedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    Trigger = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    At = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Lat = table.Column<double>(type: "double precision", nullable: true),
                    Lon = table.Column<double>(type: "double precision", nullable: true),
                    BatteryFraction = table.Column<double>(type: "double precision", nullable: true),
                    ClearedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ClearedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DuressSignals", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Vehicles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CarrierId = table.Column<Guid>(type: "uuid", nullable: false),
                    Plate = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Truck = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    LicenceExpires = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RoadworthinessExpires = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    InsuranceExpires = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    PermitExpires = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RetiredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Vehicles", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DuressSignals_TripId_At",
                table: "DuressSignals",
                columns: new[] { "TripId", "At" });

            migrationBuilder.CreateIndex(
                name: "IX_Vehicles_CarrierId",
                table: "Vehicles",
                column: "CarrierId");

            migrationBuilder.CreateIndex(
                name: "IX_Vehicles_CarrierId_Plate",
                table: "Vehicles",
                columns: new[] { "CarrierId", "Plate" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CarrierProfiles");

            migrationBuilder.DropTable(
                name: "DuressSignals");

            migrationBuilder.DropTable(
                name: "Vehicles");
        }
    }
}
