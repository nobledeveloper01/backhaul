using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backhaul.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DeliveryDropsAndLevies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Deliveries",
                columns: table => new
                {
                    TripId = table.Column<Guid>(type: "uuid", nullable: false),
                    At = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PhotoIds = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    SignatureName = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    SignatureRole = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    SignatureImageId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    CapturedLat = table.Column<double>(type: "double precision", nullable: true),
                    CapturedLon = table.Column<double>(type: "double precision", nullable: true),
                    CapturedAccuracy = table.Column<double>(type: "double precision", nullable: true),
                    Note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    ExceptionKind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    ExceptionQuantity = table.Column<int>(type: "integer", nullable: true),
                    ExceptionNote = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    SealedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Deliveries", x => x.TripId);
                });

            migrationBuilder.CreateTable(
                name: "Drops",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TripId = table.Column<Guid>(type: "uuid", nullable: false),
                    Consignee = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Goods = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Units = table.Column<int>(type: "integer", nullable: true),
                    WeightKg = table.Column<double>(type: "double precision", nullable: false),
                    Sequence = table.Column<int>(type: "integer", nullable: false),
                    DeliveredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Exception = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Drops", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Levies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TripId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    AmountKobo = table.Column<long>(type: "bigint", nullable: false),
                    At = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Lat = table.Column<double>(type: "double precision", nullable: true),
                    Lon = table.Column<double>(type: "double precision", nullable: true),
                    Note = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    PhotoId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Levies", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Drops_TripId_Sequence",
                table: "Drops",
                columns: new[] { "TripId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Levies_TripId_At",
                table: "Levies",
                columns: new[] { "TripId", "At" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Deliveries");

            migrationBuilder.DropTable(
                name: "Drops");

            migrationBuilder.DropTable(
                name: "Levies");
        }
    }
}
