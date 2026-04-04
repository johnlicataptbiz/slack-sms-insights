/**
 * Investigation script to check for booking signals in sms_events for a specific date.
 * Run with:
 *   DATABASE_URL=<connection_string> npx tsx scripts/investigate-bookings.ts
 *
 * When running locally, pass the public Railway URL via DATABASE_URL.
 * When running inside Railway, DATABASE_URL should point to the private endpoint.
 */
import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL environment variable is required');

const BOOKED_CONFIRMATION_LINK_PATTERN = /(?:https?:\/\/)?vip\.physicaltherapybiz\.com\/call-booked(?:[/?#][^\s]*)?/i;
const HIGH_CONFIDENCE_BOOKING_PATTERN =
  /\b(call booked|booked call|booked for|appointment booked|appointment confirmed|scheduled (?:a )?call|strategy call booked)\b/i;
const CANCELLATION_PATTERN = /\b(cancel|cancellation|delete me off your list|remove me|unsubscribe|stop)\b/i;

const isHighConfidenceBookingSignal = (direction: string, body: string): boolean => {
  if (!body) return false;
  if (BOOKED_CONFIRMATION_LINK_PATTERN.test(body)) return true;
  return direction === 'inbound' && HIGH_CONFIDENCE_BOOKING_PATTERN.test(body) && !CANCELLATION_PATTERN.test(body);
};

async function investigateBookings() {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('Connecting to the database...');
    await pool.query('SELECT NOW()');
    console.log('Database connection successful.');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toISOString().split("T")[0];

    console.log(`Fetching sms_events for ${yesterdayString}...`);

    const { rows } = await pool.query(
      "SELECT event_ts, direction, body FROM sms_events WHERE DATE(event_ts) = $1",
      [yesterdayString]
    );

    console.log(`Found ${rows.length} total sms_events for yesterday.`);

    let bookingSignalCount = 0;
    const bookingSignals = [];

    for (const row of rows) {
      if (isHighConfidenceBookingSignal(row.direction, row.body)) {
        bookingSignalCount++;
        if (bookingSignals.length < 5) {
          bookingSignals.push(row);
        }
      }
    }

    console.log(`Found ${bookingSignalCount} booking signals for yesterday.`);

    if (bookingSignals.length > 0) {
      console.log('Sample booking signals:');
      console.log(JSON.stringify(bookingSignals, null, 2));
    }

  } catch (e) {
    if (e instanceof Error) {
      console.error('Error during investigation:', e.message);
    } else {
      console.error('An unknown error occurred:', e);
    }
    process.exit(1);
  } finally {
    await pool.end();
    console.log('Database pool closed.');
  }
}

investigateBookings();
