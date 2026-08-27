using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backhaul.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class LoadBoard : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Bids",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LoadId = table.Column<Guid>(type: "uuid", nullable: false),
                    CarrierId = table.Column<Guid>(type: "uuid", nullable: false),
                    AmountKobo = table.Column<long>(type: "bigint", nullable: false),
                    AtLat = table.Column<double>(type: "double precision", nullable: false),
                    AtLon = table.Column<double>(type: "double precision", nullable: false),
                    PlacedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    WithdrawnAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Bids", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Loads",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ShipperId = table.Column<Guid>(type: "uuid", nullable: false),
                    OriginName = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    DestinationName = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    OriginLat = table.Column<double>(type: "double precision", nullable: false),
                    OriginLon = table.Column<double>(type: "double precision", nullable: false),
                    DestinationLat = table.Column<double>(type: "double precision", nullable: false),
                    DestinationLon = table.Column<double>(type: "double precision", nullable: false),
                    Cargo = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    WeightTonnes = table.Column<double>(type: "double precision", nullable: false),
                    Requires = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    OfferedKobo = table.Column<long>(type: "bigint", nullable: true),
                    ReadyBy = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AwardedToCarrierId = table.Column<Guid>(type: "uuid", nullable: true),
                    AwardedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Loads", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Bids_LoadId",
                table: "Bids",
                column: "LoadId");

            migrationBuilder.CreateIndex(
                name: "IX_Bids_LoadId_CarrierId",
                table: "Bids",
                columns: new[] { "LoadId", "CarrierId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Loads_AwardedAt_ExpiresAt",
                table: "Loads",
                columns: new[] { "AwardedAt", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Loads_ShipperId",
                table: "Loads",
                column: "ShipperId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Bids");

            migrationBuilder.DropTable(
                name: "Loads");
        }
    }
}
