using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backhaul.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TierIsReviewed : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RequiresTier",
                table: "Loads",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "VerifiedIdentity",
                table: "CarrierProfiles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "VerifiedInsurance",
                table: "CarrierProfiles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "VerifiedLicence",
                table: "CarrierProfiles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "VerifiedRegistration",
                table: "CarrierProfiles",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RequiresTier",
                table: "Loads");

            migrationBuilder.DropColumn(
                name: "VerifiedIdentity",
                table: "CarrierProfiles");

            migrationBuilder.DropColumn(
                name: "VerifiedInsurance",
                table: "CarrierProfiles");

            migrationBuilder.DropColumn(
                name: "VerifiedLicence",
                table: "CarrierProfiles");

            migrationBuilder.DropColumn(
                name: "VerifiedRegistration",
                table: "CarrierProfiles");
        }
    }
}
