using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backhaul.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PromisedArrival : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Incidents",
                table: "CarrierProfiles");

            migrationBuilder.DropColumn(
                name: "TripsCompleted",
                table: "CarrierProfiles");

            migrationBuilder.DropColumn(
                name: "TripsOnTime",
                table: "CarrierProfiles");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeliverBy",
                table: "TripTerms",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DeliverBy",
                table: "TripTerms");

            migrationBuilder.AddColumn<int>(
                name: "Incidents",
                table: "CarrierProfiles",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "TripsCompleted",
                table: "CarrierProfiles",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "TripsOnTime",
                table: "CarrierProfiles",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }
    }
}
