#!/bin/bash

# SMS Insights Database Setup Script
# This script sets up PostgreSQL for the SMS Insights platform
# Supports both Railway (production) and local development

set -e

echo ""
echo "=========================================="
echo "SMS Insights Database Setup"
echo "=========================================="
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL client not found"
    echo ""
    echo "Install PostgreSQL:"
    echo "  macOS: brew install postgresql"
    echo "  Ubuntu: sudo apt-get install postgresql-client"
    echo "  Windows: Download from https://www.postgresql.org/download/"
    exit 1
fi

echo "✓ PostgreSQL client found"
echo ""

# Choose environment
echo "Select database environment:"
echo "1) Local PostgreSQL (development)"
echo "2) Railway PostgreSQL (production/staging)"
echo "3) Skip setup (use existing connection)"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo "Setting up local PostgreSQL..."
        echo ""
        
        # Check if PostgreSQL service is running
        if ! pg_isready -h localhost &> /dev/null; then
            echo "⚠ PostgreSQL server not running on localhost:5432"
            echo ""
            echo "Start PostgreSQL:"
            echo "  macOS: brew services start postgresql"
            echo "  Ubuntu: sudo systemctl start postgresql"
            echo ""
            read -p "Is PostgreSQL running now? (y/n): " running
            if [ "$running" != "y" ]; then
                echo "❌ Cannot proceed without PostgreSQL running"
                exit 1
            fi
        fi
        
        echo "✓ PostgreSQL server is running"
        echo ""
        
        # Create database
        echo "Creating database 'sms_insights'..."
        createdb sms_insights 2>/dev/null || echo "  (Database may already exist)"
        echo "✓ Database ready"
        echo ""
        
        # Update .env
        echo "Updating .env file..."
        DATABASE_URL='postgresql://localhost/sms_insights'
        echo "DATABASE_PUBLIC_URL=\"$DATABASE_URL\"" > .env.local
        echo "✓ .env.local updated with: $DATABASE_URL"
        echo ""
        
        # Test connection
        echo "Testing connection..."
        psql "$DATABASE_URL" -c "SELECT 1" > /dev/null && echo "✓ Connection successful" || echo "❌ Connection failed"
        echo ""
        
        echo "Next steps:"
        echo "1. Add to .env: export DATABASE_PUBLIC_URL=\"$DATABASE_URL\""
        echo "2. Run migrations: npx prisma migrate deploy"
        echo "3. Run audit: python3 db-audit.py"
        ;;
        
    2)
        echo ""
        echo "Setting up Railway PostgreSQL..."
        echo ""
        echo "Steps:"
        echo "1. Go to https://railway.app"
        echo "2. Select SMS Insights project"
        echo "3. Click PostgreSQL service"
        echo "4. Click 'Connect' tab"
        echo "5. Copy the connection string"
        echo ""
        read -p "Paste your Railway DATABASE_PUBLIC_URL: " railway_url
        
        if [[ ! "$railway_url" =~ ^postgres ]]; then
            echo "❌ Invalid PostgreSQL URL"
            exit 1
        fi
        
        echo "Saving to .env.local..."
        echo "DATABASE_PUBLIC_URL=\"$railway_url\"" > .env.local
        echo "✓ .env.local updated"
        echo ""
        
        echo "Testing connection..."
        if psql "$railway_url" -c "SELECT 1" > /dev/null 2>&1; then
            echo "✓ Connection successful"
        else
            echo "⚠ Connection test failed - verify URL and network access"
        fi
        echo ""
        
        echo "Next steps:"
        echo "1. Update .env with the Railway URL"
        echo "2. Run migrations: npx prisma migrate deploy"
        echo "3. Run audit: python3 db-audit.py"
        ;;
        
    3)
        echo "Skipping setup - using existing connection"
        echo ""
        echo "To configure later:"
        echo "export DATABASE_PUBLIC_URL='postgresql://...'"
        ;;
        
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "=========================================="
echo "Setup Complete"
echo "=========================================="
echo ""
echo "To run the database audit:"
echo "  cd sms-insights"
echo "  export DATABASE_PUBLIC_URL='your-connection-url'"
echo "  python3 db-audit.py"
echo ""
