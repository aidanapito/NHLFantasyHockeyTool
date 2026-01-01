"""
Database validation script for Python analytics service.

This script validates:
1. Database connectivity via SQLAlchemy
2. Schema structure
3. Foreign key relationships
4. Data consistency

Usage (from project root):
    cd analytics-service
    source venv/bin/activate
    python validate_database.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, inspect, text

# Add parent directory to path to import config
sys.path.insert(0, str(Path(__file__).parent))

try:
    from dotenv import load_dotenv
    # Load .env from project root (2 levels up from analytics-service)
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass


class ValidationResult:
    def __init__(self, name: str, status: str, message: str, details: dict | None = None):
        self.name = name
        self.status = status  # 'pass', 'fail', 'warning'
        self.message = message
        self.details = details or {}


class DatabaseValidator:
    def __init__(self):
        self.results: list[ValidationResult] = []
        self.engine = None
        self._setup_engine()

    def _setup_engine(self):
        """Set up database engine connection."""
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL environment variable is not set")
        # Remove Prisma-specific schema parameter
        if "?schema=" in database_url:
            database_url = database_url.split("?")[0]
        self.engine = create_engine(database_url)

    def _add_result(self, name: str, status: str, message: str, details: dict | None = None):
        """Add a validation result."""
        self.results.append(ValidationResult(name, status, message, details))
        icon = "✅" if status == "pass" else "❌" if status == "fail" else "⚠️"
        print(f"{icon} {name}: {message}")
        if details and status in ("fail", "warning"):
            print(f"   Details: {details}")

    def validate_connectivity(self):
        """Test database connectivity."""
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text("SELECT COUNT(*) FROM \"Player\""))
                count = result.scalar()
                self._add_result(
                    "Database Connectivity",
                    "pass",
                    f"Successfully connected and queried database (found {count} players)"
                )
        except Exception as e:
            self._add_result("Database Connectivity", "fail", f"Failed to connect: {str(e)}")

    def validate_schema(self):
        """Validate that required tables exist."""
        try:
            inspector = inspect(self.engine)
            tables = inspector.get_table_names()

            expected_tables = [
                "Player",
                "PlayerStats",
                "PlayerProjection",
                "GameLog",
                "FantasyLeague",
                "FantasyTeam",
                "FantasyRoster",
                "DataRefresh",
            ]

            missing = [t for t in expected_tables if t not in tables]
            unexpected = [t for t in tables if t not in expected_tables and not t.startswith("_")]

            if missing:
                self._add_result(
                    "Schema - Required Tables",
                    "fail",
                    f"Missing tables: {', '.join(missing)}",
                    {"missing": missing}
                )
            else:
                self._add_result("Schema - Required Tables", "pass", "All required tables exist")

            if unexpected:
                self._add_result(
                    "Schema - Unexpected Tables",
                    "warning",
                    f"Found unexpected tables: {', '.join(unexpected)}",
                    {"unexpected": unexpected}
                )
        except Exception as e:
            self._add_result("Schema Validation", "fail", f"Error checking schema: {str(e)}")

    def validate_foreign_keys(self):
        """Validate foreign key relationships."""
        checks = [
            {
                "name": "GameLog.playerId",
                "query": """
                    SELECT COUNT(*) as count
                    FROM "GameLog" gl
                    LEFT JOIN "Player" p ON gl."playerId" = p.id
                    WHERE p.id IS NULL
                """,
            },
            {
                "name": "PlayerStats.playerId",
                "query": """
                    SELECT COUNT(*) as count
                    FROM "PlayerStats" ps
                    LEFT JOIN "Player" p ON ps."playerId" = p.id
                    WHERE p.id IS NULL
                """,
            },
            {
                "name": "PlayerProjection.playerId",
                "query": """
                    SELECT COUNT(*) as count
                    FROM "PlayerProjection" pp
                    LEFT JOIN "Player" p ON pp."playerId" = p.id
                    WHERE p.id IS NULL
                """,
            },
            {
                "name": "FantasyRoster.playerId",
                "query": """
                    SELECT COUNT(*) as count
                    FROM "FantasyRoster" fr
                    LEFT JOIN "Player" p ON fr."playerId" = p.id
                    WHERE p.id IS NULL
                """,
            },
        ]

        for check in checks:
            try:
                with self.engine.connect() as conn:
                    result = conn.execute(text(check["query"]))
                    count = result.scalar()
                    if count > 0:
                        self._add_result(
                            f"Foreign Keys - {check['name']}",
                            "fail",
                            f"Found {count} orphaned entries",
                        )
                    else:
                        self._add_result(
                            f"Foreign Keys - {check['name']}",
                            "pass",
                            "All entries have valid player references",
                        )
            except Exception as e:
                self._add_result(
                    f"Foreign Keys - {check['name']}",
                    "fail",
                    f"Error checking: {str(e)}",
                )

    def validate_game_log_player_ids(self):
        """Check if GameLog.playerId uses database IDs or NHL IDs."""
        try:
            with self.engine.connect() as conn:
                # Check if any GameLog.playerId matches Player.nhlId but not Player.id
                query = text("""
                    SELECT COUNT(*) as count
                    FROM "GameLog" gl
                    INNER JOIN "Player" p ON gl."playerId" = p."nhlId"
                    LEFT JOIN "Player" p2 ON gl."playerId" = p2.id
                    WHERE p2.id IS NULL
                """)
                result = conn.execute(query)
                count = result.scalar()

                if count > 0:
                    self._add_result(
                        "GameLog.playerId Type Check",
                        "fail",
                        f"Found {count} GameLog entries where playerId matches Player.nhlId but not Player.id. "
                        "This suggests GameLog.playerId contains NHL IDs instead of database IDs.",
                    )
                else:
                    self._add_result(
                        "GameLog.playerId Type Check",
                        "pass",
                        "GameLog.playerId correctly uses database IDs (not NHL IDs)",
                    )
        except Exception as e:
            self._add_result(
                "GameLog.playerId Validation", "fail", f"Error checking: {str(e)}"
            )

    def validate_player_duplicates(self):
        """Check for duplicate players."""
        try:
            with self.engine.connect() as conn:
                # Check duplicate names
                query = text("""
                    SELECT 
                        "fullName",
                        COUNT(*) as count,
                        STRING_AGG(id::text, ', ' ORDER BY id) as ids
                    FROM "Player"
                    GROUP BY "fullName"
                    HAVING COUNT(*) > 1
                    ORDER BY count DESC
                    LIMIT 10
                """)
                result = conn.execute(query)
                duplicates = result.fetchall()

                if duplicates:
                    dup_list = [
                        {"name": row[0], "count": row[1], "ids": row[2]}
                        for row in duplicates
                    ]
                    self._add_result(
                        "Player Duplicates",
                        "warning",
                        f"Found {len(duplicates)} player names with multiple entries",
                        {"samples": dup_list[:5]},
                    )
                else:
                    self._add_result("Player Duplicates", "pass", "No duplicate player names found")

                # Check duplicate nhlIds
                query = text("""
                    SELECT 
                        "nhlId",
                        COUNT(*) as count,
                        STRING_AGG(id::text, ', ' ORDER BY id) as ids
                    FROM "Player"
                    WHERE "nhlId" IS NOT NULL
                    GROUP BY "nhlId"
                    HAVING COUNT(*) > 1
                    ORDER BY count DESC
                """)
                result = conn.execute(query)
                dup_nhl_ids = result.fetchall()

                if dup_nhl_ids:
                    dup_list = [
                        {"nhlId": row[0], "count": row[1], "ids": row[2]}
                        for row in dup_nhl_ids
                    ]
                    self._add_result(
                        "Player Duplicate NHL IDs",
                        "fail",
                        f"Found {len(dup_nhl_ids)} NHL IDs with multiple Player entries",
                        {"duplicates": dup_list},
                    )
                else:
                    self._add_result("Player Duplicate NHL IDs", "pass", "All NHL IDs are unique")

        except Exception as e:
            self._add_result("Player Duplicate Check", "fail", f"Error checking: {str(e)}")

    def validate_data_consistency(self):
        """Validate data consistency."""
        try:
            with self.engine.connect() as conn:
                # Check active players without data
                query = text("""
                    SELECT COUNT(*) as count
                    FROM "Player" p
                    WHERE p."isActive" = true
                    AND NOT EXISTS (SELECT 1 FROM "GameLog" gl WHERE gl."playerId" = p.id)
                    AND NOT EXISTS (SELECT 1 FROM "PlayerStats" ps WHERE ps."playerId" = p.id)
                """)
                result = conn.execute(query)
                count = result.scalar()

                if count > 0:
                    self._add_result(
                        "Data Consistency - Active Players Without Data",
                        "warning",
                        f"Found {count} active players with no GameLog or PlayerStats entries",
                    )
                else:
                    self._add_result(
                        "Data Consistency - Active Players Without Data",
                        "pass",
                        "All active players have associated data",
                    )

        except Exception as e:
            self._add_result(
                "Data Consistency Validation", "fail", f"Error checking: {str(e)}"
            )

    def generate_summary(self):
        """Generate validation summary."""
        pass_count = sum(1 for r in self.results if r.status == "pass")
        fail_count = sum(1 for r in self.results if r.status == "fail")
        warn_count = sum(1 for r in self.results if r.status == "warning")
        total = len(self.results)

        print("\n" + "=" * 60)
        print("VALIDATION SUMMARY")
        print("=" * 60)
        print(f"Total checks: {total}")
        print(f"✅ Passed: {pass_count}")
        print(f"❌ Failed: {fail_count}")
        print(f"⚠️  Warnings: {warn_count}")
        print("=" * 60)

        if fail_count > 0:
            print("\n❌ FAILED CHECKS:")
            for r in self.results:
                if r.status == "fail":
                    print(f"  - {r.name}: {r.message}")

        if warn_count > 0:
            print("\n⚠️  WARNINGS:")
            for r in self.results:
                if r.status == "warning":
                    print(f"  - {r.name}: {r.message}")

        if fail_count == 0 and warn_count == 0:
            print("\n🎉 All checks passed! Your database is properly configured.")
        elif fail_count == 0:
            print("\n✅ All critical checks passed. Some warnings were found.")
        else:
            print("\n⚠️  Some critical checks failed. Please review and fix the issues above.")
            sys.exit(1)

    def run_all(self):
        """Run all validation checks."""
        print("Starting database validation...\n")

        self.validate_connectivity()
        self.validate_schema()
        self.validate_foreign_keys()
        self.validate_game_log_player_ids()
        self.validate_player_duplicates()
        self.validate_data_consistency()

        self.generate_summary()


def main():
    try:
        validator = DatabaseValidator()
        validator.run_all()
    except Exception as e:
        print(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

