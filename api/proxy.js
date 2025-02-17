export default async function handler(req, res) {
  console.log('abcd');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const response = await fetch('https://api.hyperdx.io/api/v1/charts/series', {
      method: 'POST',
      headers: {
        Authorization: `Bearer 4ca0a329-0fc0-4ba4-b898-adc7f2a99671`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
