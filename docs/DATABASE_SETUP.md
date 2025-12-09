# Database Setup Guide

## Step 1: Choose Database Provider

You have three options:

### Option A: Neon (Recommended - Easiest)
1. Go to https://neon.tech
2. Sign up/login (free tier available)
3. Create a new project
4. Copy the connection string (looks like: `postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require`)

### Option B: Supabase
1. Go to https://supabase.com
2. Sign up/login
3. Create a new project
4. Go to Settings > Database
5. Copy the connection string

### Option C: Local PostgreSQL
1. Install PostgreSQL locally: `brew install postgresql@15` (on Mac)
2. Start PostgreSQL: `brew services start postgresql@15`
3. Create database: `createdb nhlstats`
4. Connection string: `postgresql://$(whoami)@localhost:5432/nhlstats`

## Step 2: Set Environment Variable

Create a `.env` file in the project root:

```bash
DATABASE_URL="your_connection_string_here"
```

## Step 3: Run Migrations

```bash
npx prisma migrate dev --name init
```

This will:
- Create all database tables
- Generate Prisma Client
- Set up the schema

## Step 4: Generate Prisma Client

```bash
npx prisma generate
```

## Step 5: Test Connection

You can test the connection by running:
```bash
npx prisma db pull
```

If successful, you're connected!

## Next: Update Code

Once the database is set up, we'll:
1. Update `/api/refresh-stats` to save data to database
2. Create `/api/players/stats` to query from database
3. Update the frontend to use the fast database route

