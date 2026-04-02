const MONDAY_API_URL = 'https://api.monday.com/v2';

const getMondayToken = () => {
  const token = (process.env.MONDAY_API_TOKEN || '').trim();
  if (!token) throw new Error('MONDAY_API_TOKEN is not configured');
  return token;
};

const mapSourceToMondaySource = (firstConversion) => {
  if (!firstConversion) return 'Direct Outreach';
  const normalized = firstConversion.toLowerCase();
  if (normalized.includes('book buyer') || normalized.includes('field manual')) return 'Book Buyer';
  if (normalized.includes('space')) return 'Stand Alone Space Setup Guide';
  if (normalized.includes('hiring')) return 'Hiring Guide';
  return 'Direct Outreach';
};

async function recreateMarch16And17Calls() {
  console.log('\n🔧 Recreating the 5 calls from March 16-17...\n');

  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID;
  const token = getMondayToken();

  const calls = [
    {
      name: 'Calvin` Gaines',
      date: '2026-03-16',
      firstConversion: 'The Cash-Based Practice Field Manual: Cash Practice',
    },
    {
      name: 'Mouzzam Kagalwala',
      date: '2026-03-16',
      firstConversion: 'Standalone Space Setup Guide | Physical Therapy',
    },
    {
      name: 'Joeseph Abano',
      date: '2026-03-16',
      firstConversion: 'The Cash-Based Practice Field Manual: Cash Practice',
    },
    {
      name: 'Nivedita Sinnarkar',
      date: '2026-03-17',
      firstConversion: 'Standalone Space Setup Guide | Physical Therapy',
    },
    { name: 'Dominick Dauria', date: '2026-03-17', firstConversion: 'Standalone Space Setup Guide | Physical Therapy' },
  ];

  let created = 0;

  for (const call of calls) {
    const columnValues = {
      date_mkznycfs: { date: call.date },
      color_mm089dk3: { label: 'First Swing' },
      color_mkznwqh0: { label: 'Aloware SMS' },
      color_mkznd6kp: { label: mapSourceToMondaySource(call.firstConversion) },
    };

    console.log(`Creating: ${call.name}`);
    console.log(`  Date Set: ${call.date}`);
    console.log(`  Source: ${columnValues.color_mkznd6kp.label}`);

    try {
      const mutation = `
        mutation CreateItem($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
          create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
            id
          }
        }
      `;

      const response = await fetch(MONDAY_API_URL, {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: mutation,
          variables: {
            boardId,
            itemName: call.name, // Just the name, no date suffix!
            columnValues: JSON.stringify(columnValues),
          },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        console.log(`  ✗ Error: ${result.errors[0].message}\n`);
      } else {
        console.log(`  ✓ Created ID: ${result.data.create_item.id}\n`);
        created++;
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (error) {
      console.log(`  ✗ Exception: ${error.message}\n`);
    }
  }

  console.log(`\n✅ Created ${created} out of 5 calls\n`);
}

recreateMarch16And17Calls().catch(console.error);
