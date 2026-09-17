using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Backhaul.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PaperClaims : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PaperClaims",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CarrierId = table.Column<Guid>(type: "uuid", nullable: false),
                    Paper = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ClaimedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ReviewedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    Verified = table.Column<bool>(type: "boolean", nullable: true),
                    WithdrawnAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaperClaims", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PaperClaims_CarrierId_Paper",
                table: "PaperClaims",
                columns: new[] { "CarrierId", "Paper" });

            migrationBuilder.CreateIndex(
                name: "IX_PaperClaims_ReviewedAt_WithdrawnAt_ClaimedAt",
                table: "PaperClaims",
                columns: new[] { "ReviewedAt", "WithdrawnAt", "ClaimedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PaperClaims");
        }
    }
}
