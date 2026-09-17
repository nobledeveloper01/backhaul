using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Backhaul.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TripDrivers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TripDrivers",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TripId = table.Column<Guid>(type: "uuid", nullable: false),
                    DriverId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromDriverId = table.Column<Guid>(type: "uuid", nullable: true),
                    ByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Since = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TripDrivers", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TripDrivers_TripId_Since",
                table: "TripDrivers",
                columns: new[] { "TripId", "Since" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TripDrivers");
        }
    }
}
